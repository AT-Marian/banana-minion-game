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
  const [roomCode, setRoomCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const isPlayer1 = room?.player1_id === user?.id;

  // Auto-join from URL query param
  const [autoJoinCode, setAutoJoinCode] = useState<string | null>(null);

  useEffect(() => {
    const codeFromUrl = searchParams.get("code");
    if (codeFromUrl && screen === "lobby") {
      setAutoJoinCode(codeFromUrl.toUpperCase());
      setJoinCode(codeFromUrl.toUpperCase());
      searchParams.delete("code");
      setSearchParams(searchParams, { replace: true });
    }
  }, []);

  useEffect(() => {
    if (autoJoinCode && user && profile && screen === "lobby" && !isJoining) {
      setAutoJoinCode(null);
      joinRoomWithCode(autoJoinCode);
    }
  }, [autoJoinCode, user, profile]);

  // Subscribe to room changes
  useEffect(() => {
    if (!roomId) return;
    const channel = supabase
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "multiplayer_rooms", filter: `id=eq.${roomId}` },
        (payload) => {
          const newRoom = payload.new as any;
          setRoom(newRoom);
          if (newRoom.status === "playing" && screen === "waiting") {
            setScreen("playing");
            loadQuestion();
          }
          if (newRoom.status === "finished") {
            setScreen("finished");
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roomId, screen]);

  // Timer
  useEffect(() => {
    if (screen !== "playing" || isLoading || feedback) return;
    if (timeLeft <= 0) { handleRoundEnd(); return; }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, screen, isLoading, feedback]);

  const createRoom = async () => {
    if (!user || !profile) return;
    setIsCreating(true);
    try {
      const { data, error } = await supabase
        .from("multiplayer_rooms")
        .insert({ player1_id: user.id, player1_username: profile.username, status: "waiting" as RoomStatus })
        .select()
        .single();
      if (error) throw error;
      setRoom(data);
      setRoomId(data.id);
      setRoomCode((data as any).room_code || "");
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
    setIsJoining(true);
    try {
      const query = supabase
        .from("multiplayer_rooms")
        .select("*")
        .eq("status", "waiting")
        .is("player2_id", null)
        .limit(1);
      const { data: rooms, error: findError } = await (query as any).eq("room_code", codeToUse);

      if (findError) throw findError;
      if (!rooms || rooms.length === 0) {
        toast({ title: "Room not found", description: "Check the code and try again.", variant: "destructive" });
        setIsJoining(false);
        return;
      }

      const existingRoom = rooms[0];
      if (existingRoom.player1_id === user.id) {
        toast({ title: "Can't join your own room!", variant: "destructive" });
        setIsJoining(false);
        return;
      }

      const { error } = await supabase
        .from("multiplayer_rooms")
        .update({ player2_id: user.id, player2_username: profile.username, status: "playing" as RoomStatus })
        .eq("id", existingRoom.id);
      if (error) throw error;

      setRoomId(existingRoom.id);
      setRoom({ ...existingRoom, player2_id: user.id, player2_username: profile.username, status: "playing" });
      setScreen("playing");
      loadQuestion();
    } catch {
      toast({ title: "Error joining room", variant: "destructive" });
    } finally {
      setIsJoining(false);
    }
  };

  const copyCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCopied(true);
    toast({ title: "Code copied!" });
    setTimeout(() => setCopied(false), 2000);
  };

  const shareLink = async () => {
    const link = `${window.location.origin}/game/multiplayer?code=${roomCode}`;
    await navigator.clipboard.writeText(link);
    setLinkCopied(true);
    toast({ title: "Invite link copied!" });
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const loadQuestion = async () => {
    setIsLoading(true); setSelectedAnswer(null); setFeedback(null);
    try {
      const data = await getQuestion();
      setQuestionUrl(data.questionUrl); setQuestionId(data.questionId);
      setTimeLeft(TIME_LIMIT); setRoundStartTime(Date.now());
    } catch { toast({ title: "Error loading question", variant: "destructive" }); }
    finally { setIsLoading(false); }
  };

  const handleAnswer = async (answer: number) => {
    if (isChecking || feedback) return;
    setSelectedAnswer(answer); setIsChecking(true);
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);

    try {
      const result = await checkAnswer(questionId, answer);
      if (result.correct) {
        setFeedback("correct");
        setRoundResults((prev) => [...prev, { round: room?.current_round ?? 1, correct: true, timeUsed }]);
        playBananaPop();
        const scoreField = isPlayer1 ? "player1_score" : "player2_score";
        const currentScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
        await supabase.from("multiplayer_rooms").update({ [scoreField]: currentScore + 1 }).eq("id", roomId!);
        toast({ title: "🎉 Correct!" });
      } else {
        setFeedback("wrong");
        setRoundResults((prev) => [...prev, { round: room?.current_round ?? 1, correct: false, timeUsed }]);
        playWrongBuzz();
        toast({ title: `❌ Wrong! Answer was ${result.solution}`, variant: "destructive" });
      }
      setTimeout(() => handleRoundEnd(), 1500);
    } catch { toast({ title: "Error", variant: "destructive" }); }
    finally { setIsChecking(false); }
  };

  const handleRoundEnd = async () => {
    const currentRound = room?.current_round ?? 1;
    if (currentRound >= MAX_ROUNDS) {
      const p1Score = room?.player1_score ?? 0;
      const p2Score = room?.player2_score ?? 0;
      const winnerId = p1Score > p2Score ? room?.player1_id : p1Score < p2Score ? room?.player2_id : null;
      await supabase.from("multiplayer_rooms").update({ status: "finished" as RoomStatus, winner_id: winnerId }).eq("id", roomId!);

      if (user) {
        const myScore = isPlayer1 ? p1Score : p2Score;
        await supabase.from("profiles").update({
          coins: (profile?.coins ?? 0) + myScore * 100,
          high_score: Math.max(profile?.high_score ?? 0, myScore),
          games_played: (profile?.games_played ?? 0) + 1,
        }).eq("user_id", user.id);
        await supabase.from("game_sessions").insert({ user_id: user.id, mode: "multiplayer", score: myScore, rounds_completed: MAX_ROUNDS, completed: true });
        await refreshProfile();
      }
      setScreen("finished");
    } else {
      await supabase.from("multiplayer_rooms").update({ current_round: currentRound + 1 }).eq("id", roomId!);
      loadQuestion();
    }
  };

  // Lobby - Create or Join
  if (screen === "lobby") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md bounce-in game-card-glow border-2 border-secondary/30">
          <CardContent className="p-8">
            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
            <h2 className="text-3xl font-display text-center mb-2 text-foreground">
              <Users className="inline w-8 h-8 mr-2" /> Multiplayer
            </h2>
            <p className="text-center text-muted-foreground mb-6">
              Create a room and share the code, or join with a friend's code!
            </p>

            <Button
              onClick={createRoom}
              disabled={isCreating}
              className="w-full text-lg h-14 font-bold bg-secondary hover:bg-secondary/90 text-secondary-foreground mb-4"
            >
              {isCreating ? (
                <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Creating...</>
              ) : (
                "🎮 Create Room"
              )}
            </Button>

            <div className="relative my-6">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or join a room</span>
              </div>
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Enter room code"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                maxLength={6}
                className="text-center text-lg font-mono tracking-widest uppercase"
              />
              <Button
                onClick={() => joinRoomWithCode(joinCode)}
                disabled={isJoining || joinCode.trim().length < 6}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6"
              >
                {isJoining ? <Loader2 className="w-5 h-5 animate-spin" /> : "Join"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Waiting for opponent
  if (screen === "waiting") {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
        <Card className="w-full max-w-md game-card-glow border-2 border-secondary/30">
          <CardContent className="p-8 text-center">
            <Loader2 className="w-12 h-12 mx-auto mb-4 animate-spin text-secondary" />
            <h2 className="text-2xl font-display mb-2 text-foreground">Waiting for opponent...</h2>
            <p className="text-muted-foreground mb-6">Share this code with your friend:</p>

            <div className="flex items-center justify-center gap-3 mb-6">
              <span className="text-4xl font-mono font-bold tracking-[0.3em] text-primary bg-primary/10 px-6 py-3 rounded-xl border-2 border-primary/30">
                {roomCode}
              </span>
              <Button variant="outline" size="icon" onClick={copyCode} className="h-12 w-12">
                {copied ? <Check className="w-5 h-5 text-success" /> : <Copy className="w-5 h-5" />}
              </Button>
            </div>

            <Button onClick={shareLink} variant="outline" className="w-full mb-4">
              {linkCopied ? <Check className="w-4 h-4 mr-2" /> : <Share2 className="w-4 h-4 mr-2" />}
              {linkCopied ? "Link copied!" : "Copy invite link"}
            </Button>

            <p className="text-sm text-muted-foreground">Share the code or link with your friend 🍌</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Finished
  if (screen === "finished") {
    const myScore = isPlayer1 ? (room?.player1_score ?? 0) : (room?.player2_score ?? 0);
    const opponentScore = isPlayer1 ? (room?.player2_score ?? 0) : (room?.player1_score ?? 0);
    const opponentName = isPlayer1 ? room?.player2_username : room?.player1_username;
    const playerName = isPlayer1 ? room?.player1_username : room?.player2_username;
    const isWinner = room?.winner_id === user?.id;
    const isDraw = !room?.winner_id;

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
        playerName={playerName}
        isWinner={isWinner}
        isDraw={isDraw}
        onPlayAgain={() => { setScreen("lobby"); setRoom(null); setRoomId(null); setRoundResults([]); setRoomCode(""); setJoinCode(""); }}
      />
    );
  }

  // Playing
  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b border-border p-4">
        <div className="container mx-auto flex items-center justify-between">
          <div className="text-sm">
            <span className="font-bold text-foreground">{room?.player1_username}</span>
            <span className="mx-2 text-primary font-display text-lg">{room?.player1_score ?? 0}</span>
            <span className="text-muted-foreground">vs</span>
            <span className="mx-2 text-secondary font-display text-lg">{room?.player2_score ?? 0}</span>
            <span className="font-bold text-foreground">{room?.player2_username}</span>
          </div>
          <span className="font-display text-foreground">Round {room?.current_round ?? 1}/{MAX_ROUNDS}</span>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold ${
            timeLeft <= 10 ? "bg-destructive/20 text-destructive countdown-urgent" : "bg-primary/10 text-foreground"
          }`}>
            <Clock className="w-5 h-5" />
            {timeLeft}s
          </div>
        </div>
      </header>
      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow border-2 border-secondary/20">
          <CardContent className="p-6">
            <h3 className="text-center font-display text-xl mb-4 text-foreground">
              What number does the banana represent? 🍌
            </h3>
            <div className="bg-card rounded-lg p-4 mb-6 flex justify-center min-h-[200px] items-center">
              {isLoading ? (
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary" />
              ) : (
                <img src={questionUrl} alt="Banana math puzzle" className="max-w-full h-auto rounded slide-up" />
              )}
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <Button
                  key={num}
                  onClick={() => handleAnswer(num)}
                  disabled={isChecking || isLoading || feedback !== null}
                  className={`text-2xl font-display h-14 transition-all ${
                    selectedAnswer === num
                      ? feedback === "correct" ? "bg-success text-success-foreground"
                        : feedback === "wrong" ? "bg-destructive text-destructive-foreground" : ""
                      : ""
                  }`}
                  variant={selectedAnswer === num ? "default" : "outline"}
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
