import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getQuestion, checkAnswer } from "@/lib/banana-api";
import { playBananaPop, playWrongBuzz } from "@/lib/sound";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, Users, Loader2, Copy, Check, Share2 } from "lucide-react";
import GameResults from "@/components/GameResults";

const MAX_ROUNDS = 5;
const TIME_LIMIT = 60;

type RoomStatus = "waiting" | "playing" | "finished";

interface RoundResult {
  round: number;
  correct: boolean;
  timeUsed: number;
}

const MultiplayerGame = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();

  // --- Room & Navigation State ---
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [screen, setScreen] = useState<"lobby" | "waiting" | "playing" | "finished">("lobby");
  
  // --- Game Play State ---
  const [questionUrl, setQuestionUrl] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());
  
  // --- UI Logic State ---
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPlayer1 = room?.player1_id === user?.id;

  // 1. Handle Auto-Join via URL
  useEffect(() => {
    const codeFromUrl = searchParams.get("code");
    if (codeFromUrl && user && screen === "lobby") {
      joinRoomWithCode(codeFromUrl.toUpperCase());
      searchParams.delete("code");
      setSearchParams(searchParams, { replace: true });
    }
  }, [user]);

  // 2. Realtime Engine: Syncs players and handles transitions
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as any;
          setRoom(updatedRoom);

          // Transition Creator from Waiting to Playing when Player 2 joins
          if (screen === "waiting" && updatedRoom.player2_id && updatedRoom.status === "playing") {
            setScreen("playing");
            loadQuestion();
          }

          // Sync round progression for both players
          if (screen === "playing" && updatedRoom.current_round !== room?.current_round) {
            loadQuestion();
          }

          // Move to results when finished
          if (updatedRoom.status === "finished") {
            setScreen("finished");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, screen, room?.current_round]);

  // 3. Timer Logic
  useEffect(() => {
    if (screen !== "playing" || isLoading || feedback) return;
    if (timeLeft <= 0) {
      handleRoundEnd();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, isLoading, feedback]);

  const createRoom = async () => {
    if (!user || !profile) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("multiplayer_rooms")
        .insert({
          player1_id: user.id,
          player1_username: profile.username,
          status: "waiting",
          current_round: 1,
          player1_score: 0,
          player2_score: 0
        })
        .select()
        .single();

      if (error) throw error;
      setRoom(data);
      setRoomId(data.id);
      setScreen("waiting");
    } catch (err) {
      toast({ title: "Error creating room", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  const joinRoomWithCode = async (code: string) => {
    if (!user || !profile || !code.trim()) return;
    setIsJoining(true);
    const codeToUse = code.trim().toUpperCase();

    try {
      const { data: existingRoom, error: findError } = await supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("room_code", codeToUse)
        .eq("status", "waiting")
        .single();

      if (findError || !existingRoom) {
        toast({ title: "Room not found", description: "Either code is wrong or room is full.", variant: "destructive" });
        return;
      }

      if (existingRoom.player1_id === user.id) {
        setRoom(existingRoom);
        setRoomId(existingRoom.id);
        setScreen("waiting");
        return;
      }

      // Joining Player updates the room status to "playing"
      const { data: updatedRoom, error: updateError } = await supabase
        .from("multiplayer_rooms")
        .update({
          player2_id: user.id,
          player2_username: profile.username,
          status: "playing"
        })
        .eq("id", existingRoom.id)
        .select()
        .single();

      if (updateError) throw updateError;

      setRoom(updatedRoom);
      setRoomId(updatedRoom.id);
      setScreen("playing");
      loadQuestion();
    } catch (err) {
      toast({ title: "Error joining room", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  const loadQuestion = async () => {
    setIsLoading(true);
    setSelectedAnswer(null);
    setFeedback(null);
    try {
      const data = await getQuestion();
      setQuestionUrl(data.questionUrl);
      setQuestionId(data.questionId);
      setTimeLeft(TIME_LIMIT);
      setRoundStartTime(Date.now());
    } catch {
      toast({ title: "Error loading puzzle", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleAnswer = async (answer: number) => {
    if (isChecking || feedback || !roomId) return;
    setSelectedAnswer(answer);
    setIsChecking(true);
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);

    try {
      const result = await checkAnswer(questionId, answer);
      if (result.correct) {
        setFeedback("correct");
        setRoundResults((prev) => [...prev, { round: room?.current_round, correct: true, timeUsed }]);
        playBananaPop();
        
        const scoreField = isPlayer1 ? "player1_score" : "player2_score";
        const currentScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
        
        await supabase
          .from("multiplayer_rooms")
          .update({ [scoreField]: currentScore + 1 })
          .eq("id", roomId);
      } else {
        setFeedback("wrong");
        setRoundResults((prev) => [...prev, { round: room?.current_round, correct: false, timeUsed }]);
        playWrongBuzz();
      }

      setTimeout(() => handleRoundEnd(), 1500);
    } catch {
      toast({ title: "Network error", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const handleRoundEnd = async () => {
    if (!roomId) return;
    const currentRound = room?.current_round ?? 1;

    if (currentRound >= MAX_ROUNDS) {
      const p1Score = room?.player1_score ?? 0;
      const p2Score = room?.player2_score ?? 0;
      let winnerId = null;
      if (p1Score > p2Score) winnerId = room?.player1_id;
      else if (p2Score > p1Score) winnerId = room?.player2_id;

      await supabase
        .from("multiplayer_rooms")
        .update({ status: "finished", winner_id: winnerId })
        .eq("id", roomId);

      const myScore = isPlayer1 ? p1Score : p2Score;
      await supabase.from("profiles").update({
        coins: (profile?.coins ?? 0) + (myScore * 100),
        games_played: (profile?.games_played ?? 0) + 1,
        high_score: Math.max(profile?.high_score ?? 0, myScore)
      }).eq("user_id", user?.id);
      
      await refreshProfile();
    } else if (isPlayer1) {
      // Logic: Only one player (P1) manages the round increment to prevent duplicates
      await supabase
        .from("multiplayer_rooms")
        .update({ current_round: currentRound + 1 })
        .eq("id", roomId);
    }
  };

  const copyCode = async () => {
    if (!room?.room_code) return;
    await navigator.clipboard.writeText(room.room_code);
    setCopied(true);
    toast({ title: "Code copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    const link = `${window.location.origin}/game/multiplayer?code=${room?.room_code}`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast({ title: "Invite link copied!" });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  // --- Screens ---

  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md bounce-in game-card-glow border-2 border-secondary/30">
          <CardContent className="p-8">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h2 className="text-3xl font-display text-center mb-6 text-foreground">
              <Users className="inline w-8 h-8 mr-2" /> Multiplayer
            </h2>
            <Button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full text-lg h-14 font-bold bg-secondary hover:bg-secondary/90 mb-6"
            >
              {isCreating ? <Loader2 className="animate-spin" /> : "🎮 Create Room"}
            </Button>
            <div className="relative mb-6">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">OR JOIN</span></div>
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="text-center font-mono text-lg tracking-widest"
                maxLength={6}
              />
              <Button onClick={() => joinRoomWithCode(joinCode)} disabled={isJoining || joinCode.length < 6} className="bg-primary px-6">
                {isJoining ? <Loader2 className="animate-spin" /> : "Join"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (screen === "waiting") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8 game-card-glow">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-secondary" />
          <h2 className="text-2xl font-display mb-2">Waiting for Player 2...</h2>
          <div className="bg-primary/5 p-6 rounded-xl border-2 border-dashed border-primary/20 mb-6">
            <p className="text-sm text-muted-foreground mb-2">Give this code to your friend:</p>
            <p className="text-4xl font-mono font-bold tracking-[0.2em] text-primary">{room?.room_code}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" onClick={copyCode}>
              {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
              {copied ? "Copied" : "Copy Code"}
            </Button>
            <Button variant="outline" onClick={shareLink}>
              {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
              Invite Link
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (screen === "finished") {
    const myScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
    const opponentScore = isPlayer1 ? (room?.player2_score ?? 0) : (room?.player1_score ?? 0);
    const opponentName = isPlayer1 ? room?.player2_username : room?.player1_username;
    const playerName = isPlayer1 ? room?.player1_username : room?.player2_username;

    return (
      <GameResults
        mode="multiplayer"
        score={myScore}
        maxRounds={MAX_ROUNDS}
        rounds={roundResults}
        coinsEarned={myScore * 100}
        isPerfect={myScore === MAX_ROUNDS}
        opponentScore={opponentScore}
        opponentName={opponentName}
        playerName={playerName || "Player"}
        isWinner={room?.winner_id === user?.id}
        isDraw={!room?.winner_id && myScore === opponentScore}
        onPlayAgain={() => {
          setScreen("lobby");
          setRoomId(null);
          setRoom(null);
          setRoundResults([]);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b p-4 sticky top-0 z-10">
        <div className="container mx-auto flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase text-primary/60">{room?.player1_username}</p>
              <p className="text-2xl font-display text-primary leading-none">{room?.player1_score ?? 0}</p>
            </div>
            <div className="text-lg font-bold text-muted-foreground opacity-30 italic">VS</div>
            <div className="text-center">
              <p className="text-[10px] font-bold uppercase text-secondary/60">{room?.player2_username || "..."}</p>
              <p className="text-2xl font-display text-secondary leading-none">{room?.player2_score ?? 0}</p>
            </div>
          </div>
          
          <div className="text-center bg-muted/50 px-4 py-1 rounded-full border">
            <p className="text-[10px] uppercase text-muted-foreground font-bold">Round</p>
            <p className="font-display text-lg leading-none">{room?.current_round} / {MAX_ROUNDS}</p>
          </div>

          <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold border-2 ${
            timeLeft < 10 ? 'bg-destructive/10 border-destructive text-destructive animate-pulse' : 'bg-primary/10 border-primary/20'
          }`}>
            <Clock className="w-5 h-5" /> {timeLeft}s
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow border-2 border-secondary/20 overflow-hidden">
          <CardContent className="p-6">
            <h3 className="text-center font-display text-lg mb-4 text-foreground/80">
              Solve the Banana Math! 🍌
            </h3>
            <div className="aspect-video bg-white/50 backdrop-blur rounded-xl mb-8 flex items-center justify-center border-4 border-white shadow-inner">
              {isLoading ? (
                <Loader2 className="w-10 h-10 animate-spin text-secondary" />
              ) : (
                <img src={questionUrl} alt="Math Puzzle" className="max-h-full p-2 object-contain slide-up" />
              )}
            </div>

            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant={selectedAnswer === num ? "default" : "outline"}
                  disabled={isLoading || isChecking || feedback !== null}
                  onClick={() => handleAnswer(num)}
                  className={`text-2xl font-display h-16 transition-all active:scale-90 ${
                    selectedAnswer === num && feedback === "correct" ? "bg-success text-white scale-105" : 
                    selectedAnswer === num && feedback === "wrong" ? "bg-destructive text-white" : ""
                  }`}
                >
                  {num}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default MultiplayerGame;