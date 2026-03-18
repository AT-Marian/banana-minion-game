import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Trophy, Medal, Award } from "lucide-react";

interface LeaderEntry {
  username: string;
  high_score: number;
  games_played: number;
  coins: number;
}

const Leaderboard = () => {
  const navigate = useNavigate();
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("profiles")
      .select("username, high_score, games_played, coins")
      .order("high_score", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setLeaders(data as LeaderEntry[]);
        setLoading(false);
      });
  }, []);

  const getRankIcon = (index: number) => {
    if (index === 0) return <Trophy className="w-6 h-6 text-primary" />;
    if (index === 1) return <Medal className="w-6 h-6 text-muted-foreground" />;
    if (index === 2) return <Award className="w-6 h-6 text-coin" />;
    return <span className="w-6 h-6 flex items-center justify-center font-bold text-muted-foreground">{index + 1}</span>;
  };

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b border-border p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-display text-primary">🏆 Leaderboard</h1>
          <div />
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-2xl">
        <Card className="game-card-glow">
          <CardHeader>
            <CardTitle className="font-display text-center text-foreground">Top Players</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
              </div>
            ) : leaders.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No players yet. Be the first!</p>
            ) : (
              <div className="space-y-2">
                {leaders.map((leader, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 p-4 rounded-xl transition-all ${
                      i < 3 ? "bg-primary/10 border border-primary/20" : "bg-muted/30"
                    }`}
                  >
                    {getRankIcon(i)}
                    <div className="flex-1">
                      <p className="font-bold text-foreground">{leader.username}</p>
                      <p className="text-xs text-muted-foreground">{leader.games_played} games played</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-display text-primary">{leader.high_score}</p>
                      <p className="text-xs text-muted-foreground">{leader.coins} coins</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Leaderboard;
