import { useState, useEffect, useCallback } from "react";
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

  // --- State Management ---
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [screen, setScreen] = useState<"lobby" | "waiting" | "playing" | "finished">("lobby");
  const [questionUrl, setQuestionUrl] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPlayer1 = room?.player1_id === user?.id;

  // --- 1. Load Question Logic ---
  const loadQuestion = useCallback(async () => {
    setIsLoading(true);
    setSelectedAnswer(null);
    setFeedback(null);
    try {
      const data = await getQuestion();
      setQuestionUrl(data.questionUrl);
      setQuestionId(data.questionId);
      setTimeLeft(TIME_LIMIT);
      setRoundStartTime(Date.now());
    } catch (err) {
      toast({ title: "Failed to load puzzle", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // --- 2. Realtime Subscription ---
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`multiplayer-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as any;
          setRoom(updatedRoom);

          // P1 transition: Waiting -> Playing
          if (screen === "waiting" && updatedRoom.status === "playing" && updatedRoom.player2_id) {
            setScreen("playing");
            loadQuestion();
          }

          // Sync Round Changes
          if (screen === "playing" && updatedRoom.current_round !== room?.current_round) {
            loadQuestion();
          }

          // Game End
          if (updatedRoom.status === "finished") {
            setScreen("finished");
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, screen, room?.current_round, loadQuestion]);

  // --- 3. Join Logic (The Fix) ---
  const joinRoomWithCode = async (code: string) => {
    if (!user || !profile || !code.trim()) return;
    const cleanCode = code.trim().toUpperCase();
    setIsJoining(true);

    try {
      // Step 1: Find the room
      const { data: existingRoom, error: findError } = await supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("room_code", cleanCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (findError || !existingRoom) {
        toast({ title: "Room not found", description: "Check code and try again.", variant: "destructive" });
        return;
      }

      // Step 2: Handle Re-joining (if you are already P1 or P2)
      if (existingRoom.player1_id === user.id || existingRoom.player2_id === user.id) {
        setRoom(existingRoom);
        setRoomId(existingRoom.id);
        setScreen(existingRoom.status === "waiting" ? "waiting" : "playing");
        if (existingRoom.status === "playing") loadQuestion();
        return;
      }

      // Step 3: Join as Player 2
      if (existingRoom.status !== "waiting" || existingRoom.player2_id) {
        toast({ title: "Room is full", variant: "destructive" });
        return;
      }

      const { data: joinedRoom, error: joinError } = await supabase
        .from("multiplayer_rooms")
        .update({
          player2_id: user.id,
          player2_username: profile.username,
          status: "playing" // This starts the game for both
        })
        .eq("id", existingRoom.id)
        .select()
        .single();

      if (joinError) throw joinError;

      setRoom(joinedRoom);
      setRoomId(joinedRoom.id);
      setScreen("playing");
      loadQuestion();
    } catch (err) {
      console.error("Join Error:", err);
      toast({ title: "Join failed", description: "Try again in a moment.", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  // --- 4. Create Room Logic ---
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
      toast({ title: "Creation failed", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  // --- 5. Game Play Actions ---
  const handleAnswer = async (answer: number) => {
    if (isChecking || feedback || !roomId) return;
    setSelectedAnswer(answer);
    setIsChecking(true);
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);

    try {
      const result = await checkAnswer(questionId, answer);
      const isCorrect = result.correct;
      
      if (isCorrect) {
        setFeedback("correct");
        playBananaPop();
        const scoreField = isPlayer1 ? "player1_score" : "player2_score";
        const currentScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
        await supabase.from("multiplayer_rooms").update({ [scoreField]: currentScore + 1 }).eq("id", roomId);
      } else {
        setFeedback("wrong");
        playWrongBuzz();
      }

      setRoundResults(prev => [...prev, { round: room.current_round, correct: isCorrect, timeUsed }]);
      setTimeout(() => proceedToNextStep(), 1500);
    } catch (err) {
      toast({ title: "Error checking answer" });
    } finally {
      setIsChecking(false);
    }
  };

  const proceedToNextStep = async () => {
    const currentRound = room?.current_round ?? 1;
    if (currentRound >= MAX_ROUNDS) {
      const p1Score = room.player1_score;
      const p2Score = room.player2_score;
      const winnerId = p1Score > p2Score ? room.player1_id : p1Score < p2Score ? room.player2_id : null;
      
      await supabase.from("multiplayer_rooms").update({ status: "finished", winner_id: winnerId }).eq("id", roomId!);
      
      // Update global profile stats
      const myScore = isPlayer1 ? p1Score : p2Score;
      await supabase.from("profiles").update({
        coins: (profile?.coins ?? 0) + (myScore * 100),
        games_played: (profile?.games_played ?? 0) + 1
      }).eq("user_id", user?.id);
      refreshProfile();
    } else if (isPlayer1) {
      await supabase.from("multiplayer_rooms").update({ current_round: currentRound + 1 }).eq("id", roomId!);
    }
  };

  // Timer
  useEffect(() => {
    if (screen !== "playing" || feedback) return;
    if (timeLeft <= 0) { proceedToNextStep(); return; }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, feedback]);

  // UI Utilities
  const copyCode = () => {
    navigator.clipboard.writeText(room?.room_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // --- Render ---
  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-secondary/30 game-card-glow">
          <CardContent className="p-8">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h2 className="text-3xl font-display text-center mb-6">Multiplayer</h2>
            <Button onClick={createRoom} disabled={isCreating} className="w-full h-14 bg-secondary hover:bg-secondary/90 text-lg mb-6">
              {isCreating ? <Loader2 className="animate-spin" /> : "🎮 Create Room"}
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="6-DIGIT CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="text-center font-mono tracking-widest"
                maxLength={6}
              />
              <Button onClick={() => joinRoomWithCode(joinCode)} disabled={isJoining || joinCode.length < 6}>
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
        <Card className="w-full max-w-md text-center p-8">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-secondary" />
          <h2 className="text-2xl font-display mb-6">Waiting for Opponent...</h2>
          <div className="bg-muted p-6 rounded-lg mb-4">
            <p className="text-4xl font-mono font-bold text-primary tracking-widest">{room?.room_code}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={copyCode}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied" : "Copy Room Code"}
          </Button>
        </Card>
      </div>
    );
  }

  if (screen === "finished") {
    const myScore = isPlayer1 ? room?.player1_score : room?.player2_score;
    const oppScore = isPlayer1 ? room?.player2_score : room?.player1_score;
    return (
      <GameResults
        mode="multiplayer"
        score={myScore}
        maxRounds={MAX_ROUNDS}
        rounds={roundResults}
        coinsEarned={myScore * 100}
        isPerfect={myScore === MAX_ROUNDS}
        opponentScore={oppScore}
        opponentName={isPlayer1 ? room?.player2_username : room?.player1_username}
        playerName={profile?.username || "You"}
        isWinner={room?.winner_id === user?.id}
        isDraw={!room?.winner_id && myScore === oppScore}
        onPlayAgain={() => { setScreen("lobby"); setRoomId(null); setRoom(null); }}
      />
    );
  }

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b p-4">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <div className="text-center">
              <span className="text-[10px] uppercase block opacity-60">{room?.player1_username}</span>
              <span className="text-2xl font-display text-primary">{room?.player1_score}</span>
            </div>
            <span className="opacity-20">VS</span>
            <div className="text-center">
              <span className="text-[10px] uppercase block opacity-60">{room?.player2_username}</span>
              <span className="text-2xl font-display text-secondary">{room?.player2_score}</span>
            </div>
          </div>
          <div className="text-center">
            <p className="text-xs uppercase text-muted-foreground">Round</p>
            <p className="font-display text-xl">{room?.current_round}/{MAX_ROUNDS}</p>
          </div>
          <div className={`px-4 py-2 rounded-full font-bold flex gap-2 items-center ${timeLeft < 10 ? 'bg-red-500 text-white' : 'bg-primary/20'}`}>
            <Clock className="w-5 h-5" /> {timeLeft}s
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow">
          <CardContent className="p-6">
            <div className="aspect-video bg-white rounded-lg mb-8 flex items-center justify-center overflow-hidden border-4">
              {isLoading ? <Loader2 className="animate-spin" /> : <img src={questionUrl} alt="puzzle" className="max-h-full" />}
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant={selectedAnswer === num ? "default" : "outline"}
                  disabled={isLoading || isChecking || feedback !== null}
                  onClick={() => handleAnswer(num)}
                  className={`text-2xl font-display h-16 ${
                    selectedAnswer === num && feedback === "correct" ? "bg-success text-white" : 
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