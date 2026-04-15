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
import { ArrowLeft, Clock, Users, Loader2, Copy, Check } from "lucide-react";
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

  // --- Core State ---
  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<any>(null);
  const [screen, setScreen] = useState<"lobby" | "waiting" | "playing" | "finished">("lobby");
  
  // --- Game State ---
  const [questionUrl, setQuestionUrl] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [isLoading, setIsLoading] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());
  
  // --- UI State ---
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const isPlayer1 = room?.player1_id === user?.id;

  // --- Logic: Load Question ---
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
    } catch {
      toast({ title: "Puzzle failed to load", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // --- Logic: Realtime Sync ---
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`sync_${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updated = payload.new as any;
          setRoom(updated);

          // P1 Start Trigger: Waiting -> Playing
          if (screen === "waiting" && updated.player2_id && updated.status === "playing") {
            setScreen("playing");
            loadQuestion();
          }

          // Round Sync
          if (screen === "playing" && updated.current_round !== room?.current_round) {
            loadQuestion();
          }

          // End Game
          if (updated.status === "finished") setScreen("finished");
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [roomId, screen, room?.current_round, loadQuestion]);

  // --- Logic: Join Room ---
  const joinRoomWithCode = async (code: string) => {
    if (!user || !profile || !code.trim()) return;
    setIsJoining(true);
    const cleanCode = code.trim().toUpperCase();

    try {
      // 1. Fetch room manually first
      const { data: rooms } = await supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("room_code", cleanCode)
        .neq("status", "finished");

      if (!rooms || rooms.length === 0) {
        toast({ title: "Room not found", variant: "destructive" });
        return;
      }

      const targetRoom = rooms[0];

      // 2. Attempt the Update (This is where RLS usually blocks)
      const { data: updatedRows, error: updateError } = await supabase
        .from("multiplayer_rooms")
        .update({
          player2_id: user.id,
          player2_username: profile.username,
          status: "playing"
        })
        .eq("id", targetRoom.id)
        .is("player2_id", null)
        .select();

      if (updateError || !updatedRows || updatedRows.length === 0) {
        throw new Error("Update failed. Check RLS policies or room status.");
      }

      const updatedRoom = updatedRows[0];
      setRoom(updatedRoom);
      setRoomId(updatedRoom.id);
      setScreen("playing");
      loadQuestion();
      
    } catch (err: any) {
      toast({ title: "Join Failed", description: "The database blocked the join request. Ensure RLS is configured.", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  // --- Logic: Create Room ---
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
        .select();

      if (error || !data) throw error;
      
      setRoom(data[0]);
      setRoomId(data[0].id);
      setScreen("waiting");
    } catch {
      toast({ title: "Could not create room", variant: "destructive" });
    } finally {
      setIsCreating(false);
    }
  };

  // --- Logic: Handle Answer ---
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
    } catch {
      toast({ title: "Score update failed" });
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
      await supabase.from("multiplayer_rooms").update({ current_round: currentRound + 1 }).eq("id", roomId);
    }
  };

  // Timer
  useEffect(() => {
    if (screen !== "playing" || feedback) return;
    if (timeLeft <= 0) { proceedToNextStep(); return; }
    const timer = setInterval(() => setTimeLeft(t => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, feedback]);

  // --- Render Screens ---

  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-2xl">
          <CardContent className="p-8">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h2 className="text-3xl font-display text-center mb-8">Multiplayer</h2>
            <Button onClick={createRoom} disabled={isCreating} className="w-full h-14 bg-secondary text-lg mb-8">
              {isCreating ? <Loader2 className="animate-spin" /> : "🎮 Create Room"}
            </Button>
            <div className="flex gap-2">
              <Input
                placeholder="ROOM CODE"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="text-center font-mono"
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
          <div className="bg-muted p-6 rounded-lg mb-6 border-2 border-dashed">
            <p className="text-5xl font-mono font-bold text-primary tracking-widest">{room?.room_code}</p>
          </div>
          <Button variant="outline" className="w-full" onClick={() => {
            navigator.clipboard.writeText(room?.room_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}>
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

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/90 backdrop-blur-md border-b p-4 sticky top-0 z-50">
        <div className="container mx-auto flex justify-between items-center">
          <div className="flex gap-4">
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold opacity-60 block">{room?.player1_username}</span>
              <span className="text-2xl font-display text-primary">{room?.player1_score}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] uppercase font-bold opacity-60 block">{room?.player2_username}</span>
              <span className="text-2xl font-display text-secondary">{room?.player2_score}</span>
            </div>
          </div>
          <div className={`px-4 py-2 rounded-xl font-bold flex gap-2 items-center ${timeLeft < 10 ? 'bg-red-500 text-white animate-pulse' : 'bg-primary/10'}`}>
            <Clock className="w-5 h-5" /> {timeLeft}s
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card>
          <CardContent className="p-6">
            <div className="aspect-video bg-white rounded-xl mb-8 flex items-center justify-center border">
              {isLoading ? <Loader2 className="animate-spin" /> : <img src={questionUrl} alt="puzzle" className="max-h-full" />}
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  variant={selectedAnswer === num ? "default" : "outline"}
                  disabled={isLoading || isChecking || feedback !== null}
                  onClick={() => handleAnswer(num)}
                  className={`text-3xl font-display h-20 ${
                    selectedAnswer === num && feedback === "correct" ? "bg-green-500 text-white" : 
                    selectedAnswer === num && feedback === "wrong" ? "bg-red-500 text-white" : ""
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