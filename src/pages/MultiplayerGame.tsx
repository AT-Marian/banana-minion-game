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
import { Database } from "@/integrations/supabase/types";

// Define the Room type based on your Database schema to avoid 'any'
type Room = Database["public"]["Tables"]["multiplayer_rooms"]["Row"];
type RoomUpdate = Database["public"]["Tables"]["multiplayer_rooms"]["Update"];

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
  const [searchParams] = useSearchParams();
  const { toast } = useToast();

  const [roomId, setRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
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
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPlayer1 = room?.player1_id === user?.id;

  // Handle auto-join from URL
  useEffect(() => {
    const codeFromUrl = searchParams.get("code");
    if (codeFromUrl && screen === "lobby") {
      setJoinCode(codeFromUrl.toUpperCase());
    }
  }, [searchParams, screen]);

  // Real-time listener
  useEffect(() => {
    if (!roomId) return;

    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const updatedRoom = payload.new as Room;
          setRoom(updatedRoom);

          if (updatedRoom.status === "playing" && screen !== "playing") {
            setScreen("playing");
            loadQuestion();
          }

          if (updatedRoom.status === "finished") {
            setScreen("finished");
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, screen]);

  // Timer
  useEffect(() => {
    if (screen !== "playing" || isLoading || feedback) return;
    if (timeLeft <= 0) {
      handleRoundEnd();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, isLoading, feedback]);

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
      toast({ title: "Error loading question", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const createRoom = async () => {
    if (!user || !profile) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("multiplayer_rooms")
        .insert({
          player1_id: user.id,
          player1_username: profile.username,
          status: "waiting" as RoomStatus,
        })
        .select()
        .single();

      if (error) throw error;
      setRoom(data);
      setRoomId(data.id);
      setRoomCode(data.room_code || "");
      setScreen("waiting");
    } catch {
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
      const { data: rooms, error: findError } = await supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("room_code", codeToUse)
        .eq("status", "waiting")
        .is("player2_id", null)
        .limit(1);

      if (findError) throw findError;
      if (!rooms || rooms.length === 0) {
        toast({ title: "Room not found", variant: "destructive" });
        return;
      }

      const targetRoom = rooms[0];
      const { error: updateError } = await supabase
        .from("multiplayer_rooms")
        .update({
          player2_id: user.id,
          player2_username: profile.username,
          status: "playing" as RoomStatus,
        })
        .eq("id", targetRoom.id);

      if (updateError) throw updateError;
      setRoomId(targetRoom.id);
      setScreen("playing");
      loadQuestion();
    } catch {
      toast({ title: "Error joining room", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  const handleAnswer = async (answer: number) => {
    if (isChecking || feedback || !roomId || !room) return;
    setSelectedAnswer(answer);
    setIsChecking(true);
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);

    try {
      const result = await checkAnswer(questionId, answer);
      const isCorrect = result.correct;

      if (isCorrect) {
        setFeedback("correct");
        playBananaPop();
        
        // FIX: Explicitly cast the update object to RoomUpdate to solve the 'any' index error
        const scoreUpdate: RoomUpdate = isPlayer1 
          ? { player1_score: (room.player1_score || 0) + 1 }
          : { player2_score: (room.player2_score || 0) + 1 };

        await supabase.from("multiplayer_rooms").update(scoreUpdate).eq("id", roomId);
        toast({ title: "🎉 Correct!" });
      } else {
        setFeedback("wrong");
        playWrongBuzz();
        toast({ title: `❌ Wrong! Answer was ${result.solution}`, variant: "destructive" });
      }

      setRoundResults((prev) => [...prev, { round: room.current_round || 1, correct: isCorrect, timeUsed }]);
      setTimeout(() => handleRoundEnd(), 1500);
    } catch {
      toast({ title: "Connection error", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const handleRoundEnd = async () => {
    if (!roomId || !room) return;
    const currentRound = room.current_round || 1;

    if (currentRound >= MAX_ROUNDS) {
      const p1Score = room.player1_score || 0;
      const p2Score = room.player2_score || 0;
      let winnerId: string | null = null;
      if (p1Score > p2Score) winnerId = room.player1_id;
      else if (p2Score > p1Score) winnerId = room.player2_id;

      await supabase
        .from("multiplayer_rooms")
        .update({ status: "finished" as RoomStatus, winner_id: winnerId })
        .eq("id", roomId);

      if (user && profile) {
        const myScore = isPlayer1 ? p1Score : p2Score;
        await supabase.from("profiles").update({
          coins: (profile.coins || 0) + myScore * 100,
          high_score: Math.max(profile.high_score || 0, myScore),
          games_played: (profile.games_played || 0) + 1,
        }).eq("user_id", user.id);
        refreshProfile();
      }
    } else {
      await supabase
        .from("multiplayer_rooms")
        .update({ current_round: currentRound + 1 })
        .eq("id", roomId);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 game-card-glow">
          <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h2 className="text-3xl font-display text-center mb-6"><Users className="inline mr-2" /> Multiplayer</h2>
          <Button onClick={createRoom} disabled={isCreating} className="w-full h-14 text-lg font-bold bg-secondary mb-6">
            {isCreating ? <Loader2 className="animate-spin" /> : "🎮 Create Room"}
          </Button>
          <div className="flex gap-2">
            <Input 
              placeholder="CODE" 
              value={joinCode} 
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())} 
              className="text-center font-mono"
            />
            <Button onClick={() => joinRoomWithCode(joinCode)} disabled={isJoining || joinCode.length < 6}>
              Join
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (screen === "waiting") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md p-8 text-center game-card-glow">
          <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-secondary" />
          <h2 className="text-2xl font-display mb-4">Waiting for Opponent...</h2>
          <div className="bg-primary/10 p-6 rounded-xl mb-6">
            <span className="text-4xl font-mono font-bold tracking-widest text-primary">{roomCode}</span>
          </div>
          <Button onClick={copyCode} variant="outline" className="w-full">
            {copied ? <Check className="mr-2" /> : <Copy className="mr-2" />} {copied ? "Copied!" : "Copy Code"}
          </Button>
        </Card>
      </div>
    );
  }

  if (screen === "finished") {
    const myScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
    const opponentScore = isPlayer1 ? (room?.player2_score ?? 0) : (room?.player1_score ?? 0);
    
    return (
      <GameResults
        mode="multiplayer"
        score={myScore}
        maxRounds={MAX_ROUNDS}
        rounds={roundResults}
        coinsEarned={myScore * 100}
        opponentScore={opponentScore}
        opponentName={isPlayer1 ? room?.player2_username : room?.player1_username}
        playerName={profile?.username || "You"}
        isWinner={room?.winner_id === user?.id}
        isDraw={!room?.winner_id}
        isPerfect={myScore === MAX_ROUNDS} // FIX: Added missing required prop
        onPlayAgain={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 p-4 border-b">
        <div className="container mx-auto flex justify-between items-center">
          <div className="font-bold">
            {room?.player1_username} <span className="text-primary px-2">{room?.player1_score ?? 0}</span>
            vs
            <span className="text-secondary px-2">{room?.player2_score ?? 0}</span> {room?.player2_username}
          </div>
          <div className="flex gap-4 items-center">
            <span className="font-display">Round {room?.current_round}/{MAX_ROUNDS}</span>
            <div className="bg-background px-3 py-1 rounded-full flex items-center gap-2">
              <Clock className="w-4 h-4" /> {timeLeft}s
            </div>
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow p-6">
          <div className="aspect-video bg-muted rounded-lg mb-6 flex items-center justify-center">
            {isLoading ? <Loader2 className="animate-spin" /> : <img src={questionUrl} alt="puzzle" className="max-h-full" />}
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
              <Button
                key={num}
                variant={selectedAnswer === num ? "default" : "outline"}
                className={`h-14 text-xl font-display ${selectedAnswer === num && (feedback === 'correct' ? 'bg-green-500' : feedback === 'wrong' ? 'bg-red-500' : '')}`}
                onClick={() => handleAnswer(num)}
                disabled={isLoading || isChecking || feedback !== null}
              >
                {num}
              </Button>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
};

export default MultiplayerGame;