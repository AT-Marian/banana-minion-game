import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Star, Coins, Target, Clock, Zap, Medal, Crown, ArrowRight } from "lucide-react";
import resultsCelebration from "@/assets/results-celebration.png";
import stickerChampion from "@/assets/sticker-champion.png";

interface RoundResult {
  round: number;
  correct: boolean;
  timeUsed: number;
}

interface GameResultsProps {
  mode: "single" | "multiplayer";
  score: number;
  maxRounds: number;
  rounds: RoundResult[];
  coinsEarned: number;
  isPerfect: boolean;
  // multiplayer-specific
  opponentScore?: number;
  opponentName?: string;
  playerName?: string;
  isWinner?: boolean;
  isDraw?: boolean;
  onPlayAgain: () => void;
}

const GameResults = ({
  mode,
  score,
  maxRounds,
  rounds,
  coinsEarned,
  isPerfect,
  opponentScore,
  opponentName,
  playerName,
  isWinner,
  isDraw,
  onPlayAgain,
}: GameResultsProps) => {
  const navigate = useNavigate();

  const accuracy = maxRounds > 0 ? Math.round((score / maxRounds) * 100) : 0;
  const avgTime = rounds.length > 0 ? Math.round(rounds.reduce((sum, r) => sum + r.timeUsed, 0) / rounds.length) : 0;
  const fastestRound = rounds.length > 0 ? Math.min(...rounds.map((r) => r.timeUsed)) : 0;

  const getTitle = () => {
    if (mode === "multiplayer") {
      if (isWinner) return "🏆 Victory!";
      if (isDraw) return "🤝 It's a Draw!";
      return "😅 Defeated!";
    }
    if (isPerfect) return "🏆 Perfect Score!";
    if (accuracy >= 80) return "🌟 Amazing!";
    if (accuracy >= 60) return "👍 Good Job!";
    if (accuracy >= 40) return "🍌 Keep Going!";
    return "💪 Try Again!";
  };

  const getGrade = () => {
    if (isPerfect) return { letter: "S", color: "text-primary", bg: "bg-primary/20" };
    if (accuracy >= 80) return { letter: "A", color: "text-success", bg: "bg-success/20" };
    if (accuracy >= 60) return { letter: "B", color: "text-secondary", bg: "bg-secondary/20" };
    if (accuracy >= 40) return { letter: "C", color: "text-accent-foreground", bg: "bg-accent/40" };
    return { letter: "D", color: "text-destructive", bg: "bg-destructive/20" };
  };

  const grade = getGrade();

  return (
    <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-4">
        {/* Main Results Card */}
        <Card className="bounce-in game-card-glow border-2 border-primary/30 overflow-hidden">
          {/* Celebration Banner */}
          <div className="relative bg-gradient-to-br from-primary/20 via-secondary/10 to-primary/20 p-6 pb-3">
            <div className="absolute top-0 left-0 w-full h-full opacity-10 bg-[radial-gradient(circle_at_30%_40%,hsl(var(--primary))_0%,transparent_50%)]" />
            <div className="flex items-center justify-center gap-4">
              <img
                src={isPerfect || isWinner ? stickerChampion : resultsCelebration}
                alt="Results"
                className="w-24 h-24 float-animation drop-shadow-lg"
              />
              <div className="text-center">
                <h2 className="text-3xl font-display text-foreground">{getTitle()}</h2>
                <p className="text-muted-foreground text-sm mt-1">
                  {mode === "single" ? "Single Player" : "Multiplayer"} • {maxRounds} Rounds
                </p>
              </div>
            </div>
          </div>

          <CardContent className="p-6 space-y-5">
            {/* Multiplayer Scoreboard */}
            {mode === "multiplayer" && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className={`rounded-xl p-4 text-center ${isWinner ? "bg-primary/15 ring-2 ring-primary/30" : "bg-muted/50"}`}>
                  {isWinner && <Crown className="w-5 h-5 mx-auto mb-1 text-primary" />}
                  <p className="text-xs text-muted-foreground truncate">{playerName || "You"}</p>
                  <p className="text-4xl font-display text-foreground">{score}</p>
                </div>
                <span className="text-2xl font-display text-muted-foreground">vs</span>
                <div className={`rounded-xl p-4 text-center ${!isWinner && !isDraw ? "bg-secondary/15 ring-2 ring-secondary/30" : "bg-muted/50"}`}>
                  {!isWinner && !isDraw && <Crown className="w-5 h-5 mx-auto mb-1 text-secondary" />}
                  <p className="text-xs text-muted-foreground truncate">{opponentName || "Opponent"}</p>
                  <p className="text-4xl font-display text-foreground">{opponentScore}</p>
                </div>
              </div>
            )}

            {/* Grade + Score for Single Player */}
            {mode === "single" && (
              <div className="flex items-center justify-center gap-6">
                <div className={`w-20 h-20 rounded-2xl ${grade.bg} flex items-center justify-center`}>
                  <span className={`text-4xl font-display ${grade.color}`}>{grade.letter}</span>
                </div>
                <div className="text-center">
                  <div className="flex items-center gap-2 text-3xl font-display text-foreground">
                    <Star className="w-7 h-7 text-primary" />
                    {score}/{maxRounds}
                  </div>
                  <p className="text-muted-foreground text-sm">{accuracy}% accuracy</p>
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Coins className="w-5 h-5 mx-auto mb-1 text-coin" />
                <p className="text-lg font-display text-foreground">+{coinsEarned}</p>
                <p className="text-xs text-muted-foreground">Coins</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Clock className="w-5 h-5 mx-auto mb-1 text-secondary" />
                <p className="text-lg font-display text-foreground">{avgTime}s</p>
                <p className="text-xs text-muted-foreground">Avg Time</p>
              </div>
              <div className="bg-muted/50 rounded-xl p-3 text-center">
                <Zap className="w-5 h-5 mx-auto mb-1 text-primary" />
                <p className="text-lg font-display text-foreground">{fastestRound}s</p>
                <p className="text-xs text-muted-foreground">Fastest</p>
              </div>
            </div>

            {/* Round-by-Round Breakdown */}
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Round Breakdown
              </h3>
              <div className="space-y-2">
                {rounds.map((r) => (
                  <div
                    key={r.round}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      r.correct
                        ? "border-success/30 bg-success/5"
                        : "border-destructive/30 bg-destructive/5"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                        r.correct ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                      }`}>
                        {r.round}
                      </div>
                      <span className="text-sm font-medium text-foreground">
                        {r.correct ? "Correct ✓" : "Incorrect ✗"}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">{r.timeUsed}s</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Rewards */}
            {isPerfect && (
              <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex items-center gap-3">
                <Medal className="w-8 h-8 text-primary flex-shrink-0" />
                <div>
                  <p className="font-bold text-foreground text-sm">Minion Sticker Earned! 🎉</p>
                  <p className="text-xs text-muted-foreground">Perfect scores unlock exclusive stickers</p>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button onClick={onPlayAgain} className="flex-1 h-12 text-base font-bold">
                Play Again <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
              <Button variant="outline" onClick={() => navigate("/dashboard")} className="flex-1 h-12 text-base">
                Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default GameResults;
