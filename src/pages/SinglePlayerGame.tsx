import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { getQuestion, checkAnswer } from "@/lib/banana-api";
import { playBananaPop, playWrongBuzz } from "@/lib/sound";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Clock, Star } from "lucide-react";
import GameResults from "@/components/GameResults";

const MAX_ROUNDS = 5;
const TIME_LIMIT = 60;

interface RoundResult {
  round: number;
  correct: boolean;
  timeUsed: number;
}

const SinglePlayerGame = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT);
  const [questionUrl, setQuestionUrl] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isChecking, setIsChecking] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [roundResults, setRoundResults] = useState<RoundResult[]>([]);
  const [roundStartTime, setRoundStartTime] = useState(Date.now());

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
      toast({ title: "Error loading question", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadQuestion();
  }, []);

  useEffect(() => {
    if (gameOver || isLoading || feedback) return;
    if (timeLeft <= 0) {
      handleTimeUp();
      return;
    }
    const timer = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(timer);
  }, [timeLeft, gameOver, isLoading, feedback]);

  const handleTimeUp = () => {
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);
    setRoundResults((prev) => [...prev, { round, correct: false, timeUsed }]);

    if (round >= MAX_ROUNDS) {
      endGame();
    } else {
      toast({ title: "⏰ Time's up!", description: "Moving to next round..." });
      setRound((r) => r + 1);
      loadQuestion();
    }
  };

  const handleAnswer = async (answer: number) => {
    if (isChecking || feedback) return;
    setSelectedAnswer(answer);
    setIsChecking(true);
    const timeUsed = Math.round((Date.now() - roundStartTime) / 1000);

    try {
      const result = await checkAnswer(questionId, answer);
      if (result.correct) {
        setFeedback("correct");
        setScore((s) => s + 1);
        setRoundResults((prev) => [...prev, { round, correct: true, timeUsed }]);
        playBananaPop();
        toast({ title: "🎉 Correct!", description: "+100 coins!" });
      } else {
        setFeedback("wrong");
        setRoundResults((prev) => [...prev, { round, correct: false, timeUsed }]);
        playWrongBuzz();
        toast({
          title: "❌ Wrong!",
          description: `The answer was ${result.solution}`,
          variant: "destructive",
        });
      }

      setTimeout(() => {
        if (round >= MAX_ROUNDS) {
          endGame();
        } else {
          setRound((r) => r + 1);
          loadQuestion();
        }
      }, 1500);
    } catch {
      toast({ title: "Error checking answer", variant: "destructive" });
    } finally {
      setIsChecking(false);
    }
  };

  const endGame = async () => {
    setGameOver(true);
    if (!user) return;

    // Use the latest score (need to calculate from roundResults since setState is async)
    const finalScore = roundResults.filter((r) => r.correct).length + (feedback === "correct" ? 1 : 0);
    const totalCoins = finalScore * 100;

    await supabase.from("game_sessions").insert({
      user_id: user.id,
      mode: "single",
      score: finalScore,
      rounds_completed: round,
      max_rounds: MAX_ROUNDS,
      completed: true,
    });

    const newCoins = (profile?.coins ?? 0) + totalCoins;
    const newHighScore = Math.max(profile?.high_score ?? 0, finalScore);
    const newGamesPlayed = (profile?.games_played ?? 0) + 1;
    const earnedSticker = finalScore === MAX_ROUNDS;
    const newStickers = (profile?.stickers_earned ?? 0) + (earnedSticker ? 1 : 0);

    await supabase
      .from("profiles")
      .update({
        coins: newCoins,
        high_score: newHighScore,
        games_played: newGamesPlayed,
        stickers_earned: newStickers,
      })
      .eq("user_id", user.id);

    if (earnedSticker) {
      await supabase.from("rewards").insert({
        user_id: user.id,
        sticker_url: "/sticker-champion.png",
        sticker_name: "Champion Banana",
      });
    }

    if (newCoins >= 100 && (profile?.coins ?? 0) < 100) {
      toast({
        title: "🎊 Milestone! 100 Coins!",
        description: "You earned 10 bonus minion stickers!",
      });
    }

    await refreshProfile();
  };

  if (gameOver) {
    const finalScore = roundResults.filter((r) => r.correct).length;
    return (
      <GameResults
        mode="single"
        score={finalScore}
        maxRounds={MAX_ROUNDS}
        rounds={roundResults}
        coinsEarned={finalScore * 100}
        isPerfect={finalScore === MAX_ROUNDS}
        onPlayAgain={() => window.location.reload()}
      />
    );
  }

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b border-border p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <span className="font-display text-lg text-foreground">Round {round}/{MAX_ROUNDS}</span>
            <div className="flex items-center gap-1 text-foreground">
              <Star className="w-4 h-4 text-primary" />
              <span className="font-bold">{score}</span>
            </div>
          </div>
          <div className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold ${
            timeLeft <= 10 ? "bg-destructive/20 text-destructive countdown-urgent" : "bg-primary/10 text-foreground"
          }`}>
            <Clock className="w-5 h-5" />
            {timeLeft}s
          </div>
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow border-2 border-primary/20">
          <CardContent className="p-6">
            <h3 className="text-center font-display text-xl mb-4 text-foreground">
              What number does the banana represent? 🍌
            </h3>
            <div className="bg-card rounded-lg p-4 mb-6 flex justify-center min-h-[200px] items-center">
              {isLoading ? (
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
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
                      ? feedback === "correct"
                        ? "bg-success text-success-foreground"
                        : feedback === "wrong"
                        ? "bg-destructive text-destructive-foreground"
                        : ""
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

export default SinglePlayerGame;
