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
      .channel(`room_sync_${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as any;
          setRoom(updatedRoom);

          // P1 transition: Waiting -> Playing (triggered by P2 joining)
          if (screen === "waiting" && updatedRoom.player2_id && updatedRoom.status === "playing") {
            setScreen("playing");
            loadQuestion();
          }

          // Sync Round Changes (Next question)
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

  // --- 3. Join Logic (Improved Error Handling) ---
  const joinRoomWithCode = async (code: string) => {
    if (!user || !profile || !code.trim()) return;
    const cleanCode = code.trim().toUpperCase();
    setIsJoining(true);

    try {
      // Step 1: Find the room based on the code
      const { data: rooms, error: findError } = await supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("room_code", cleanCode)
        .neq("status", "finished") // Don't join old games
        .order('created_at', { ascending: false });

      if (findError || !rooms || rooms.length === 0) {
        toast({ title: "Room not found", description: "The code is incorrect or the game ended.", variant: "destructive" });
        return;
      }

      const targetRoom = rooms[0];

      // Step 2: If user is already in this room, just enter it
      if (targetRoom.player1_id === user.id || targetRoom.player2_id === user.id) {
        setRoom(targetRoom);
        setRoomId(targetRoom.id);
        setScreen(targetRoom.status === "waiting" ? "waiting" : "playing");
        if (targetRoom.status === "playing") loadQuestion();
        return;
      }

      // Step 3: Check if room is available
      if (targetRoom.player2_id) {
        toast({ title: "Room is full", variant: "destructive" });
        return;
      }

      // Step 4: Perform the Join Update
      const { data: updated, error: updateError } = await supabase
        .from("multiplayer_rooms")
        .update({
          player2_id: user.id,
          player2_username: profile.username,
          status: "playing"
        })
        .eq("id", targetRoom.id)
        .select()
        .single();

      if (updateError) {
        console.error("Supabase Update Error:", updateError);
        throw new Error(updateError.message);
      }

      setRoom(updated);
      setRoomId(updated.id);
      setScreen("playing");
      loadQuestion();
      
    } catch (err: any) {
      console.error("Detailed Join Error:", err);
      toast({ 
        title: "Join Failed", 
        description: err.message || "Connection error. Try again.", 
        variant: "destructive" 
      });
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
      toast({ title: "Room creation failed", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  // --- 5. Game Play Logic ---
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
      setTimeout(() => proceedToNextStep(), 1200);
    } catch (err) {
      toast({ title: "Connection error" });
    } finally {
      setIsChecking(false);
    }
  };

  const proceedToNextStep = async () => {
    if (!roomId) return;
    const currentRound = room?.current_round ?? 1;

    if (currentRound >= MAX_ROUNDS) {
      const winnerId = room.player1_score > room.player2_score ? room.player1_id : 
                       room.player2_score > room.player1_score ? room.player2_id : null;
      
      await supabase.from("multiplayer_rooms").update({ status: "finished", winner_id: winnerId }).eq("id", roomId);
      
      const myScore = isPlayer1 ? room.player1_score : room.player2_score;
      await supabase.from("profiles").update({
        coins: (profile?.coins ?? 0) + (myScore * 100),
        games_played: (profile?.games_played ?? 0) + 1
      }).eq("user_id", user?.id);
      refreshProfile();
    } else if (isPlayer1) {
      // Only Player 1 increments the round to avoid race conditions
      await supabase.from("multiplayer_rooms").update({ current_round: currentRound + 1 }).eq("id", roomId);
    }
  };

  // Timer Effect
  useEffect(() => {
    if (screen !== "playing" || feedback) return;
    if (timeLeft <= 0) { proceedToNextStep(); return; }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, feedback]);

  // --- Render ---
  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md border-2 border-secondary/30 shadow-2xl">
          <CardContent className="p-8">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h2 className="text-3xl font-display text-center mb-6">Multiplayer</h2>
            <Button onClick={createRoom} disabled={isCreating} className="w-full h-14 bg-secondary hover:bg-secondary/90 text-lg mb-8 shadow-lg">
              {isCreating ? <Loader2 className="animate-spin" /> : "🎮 Create Room"}
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="6-DIGIT CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="text-center font-mono tracking-widest uppercase h-12"
                maxLength={6}
              />
              <Button onClick={() => joinRoomWithCode(joinCode)} disabled={isJoining || joinCode.length < 6} className="h-12 px-6">
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
          <div className="bg-muted p-6 rounded-lg mb-6 border-2 border-dashed border-primary/20">
            <p className="text-sm text-muted-foreground mb-2 uppercase font-bold tracking-tighter">Room Code</p>
            <p className="text-5xl font-mono font-bold text-primary tracking-[0.2em]">{room?.room_code}</p>
          </div>
          <Button variant="outline" className="w-full h-12" onClick={() => {
            navigator.clipboard.writeText(room?.room_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}>
            {copied ? <Check className="w-4 h-4 mr-2" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? "Copied!" : "Copy Room Code"}
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
        onPlayAgain={() => { setScreen("lobby"); setRoomId(null); setRoom(null); setRoundResults([]); }}
      />
    );
  }

  // --- Playing Game UI ---
  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/90 backdrop-blur-md border-b p-4 shadow-sm sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex gap-4 items-center">
            <div className="text-center px-3">
              <span className="text-[10px] uppercase font-bold opacity-60 block">{room?.player1_username}</span>
              <span className="text-2xl font-display text-primary">{room?.player1_score}</span>
            </div>
            <div className="w-[1px] h-8 bg-border" />
            <div className="text-center px-3">
              <span className="text-[10px] uppercase font-bold opacity-60 block">{room?.player2_username}</span>
              <span className="text-2xl font-display text-secondary">{room?.player2_score}</span>
            </div>
          </div>
          <div className="bg-secondary/10 px-4 py-1 rounded-full border border-secondary/20">
            <span className="text-xs uppercase text-muted-foreground mr-2 font-bold">Round</span>
            <span className="font-display text-xl">{room?.current_round}/{MAX_ROUNDS}</span>
          </div>
          <div className={`px-4 py-2 rounded-xl font-bold flex gap-2 items-center transition-colors border-2 ${
            timeLeft < 10 ? 'bg-red-500 border-red-600 text-white animate-pulse' : 'bg-primary/10 border-primary/20'
          }`}>
            <Clock className="w-5 h-5" /> {timeLeft}s
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="border-2 border-primary/10 shadow-xl overflow-hidden">
          <CardContent className="p-6">
            <div className="aspect-video bg-white rounded-xl mb-8 flex items-center justify-center border shadow-inner">
              {isLoading ? (
                <Loader2 className="w-12 h-12 animate-spin text-secondary" />
              ) : (
                <img src={questionUrl} alt="puzzle" className="max-h-full object-contain p-4" />
              )}
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant={selectedAnswer === num ? "default" : "outline"}
                  disabled={isLoading || isChecking || feedback !== null}
                  onClick={() => handleAnswer(num)}
                  className={`text-3xl font-display h-20 transition-all ${
                    selectedAnswer === num && feedback === "correct" ? "bg-green-500 text-white hover:bg-green-500 scale-105" : 
                    selectedAnswer === num && feedback === "wrong" ? "bg-red-500 text-white hover:bg-red-500" : ""
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