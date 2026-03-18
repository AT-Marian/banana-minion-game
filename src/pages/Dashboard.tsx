import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Trophy, Users, User, LogOut, Coins, Star } from "lucide-react";

const Dashboard = () => {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen sky-gradient">
      {/* Header */}
      <header className="bg-card/80 backdrop-blur-sm border-b border-border p-4">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-display text-primary">🍌 Bananaaa</h1>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-primary/10 rounded-full px-4 py-1">
              <Coins className="w-5 h-5 text-coin" />
              <span className="font-bold text-foreground">{profile?.coins ?? 0}</span>
            </div>
            <div className="flex items-center gap-2 bg-secondary/10 rounded-full px-4 py-1">
              <Star className="w-5 h-5 text-secondary" />
              <span className="font-bold text-foreground">{profile?.high_score ?? 0}</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/profile")}
              className="font-semibold"
            >
              <User className="w-4 h-4 mr-1" />
              {profile?.username}
            </Button>
            <Button variant="ghost" size="icon" onClick={signOut}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* Game Mode Selection */}
      <main className="container mx-auto py-12 px-4">
        <div className="text-center mb-12 slide-up">
          <h2 className="text-4xl font-display mb-2 text-foreground">Choose Your Mode</h2>
          <p className="text-lg text-muted-foreground">Pick how you want to play!</p>
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-3xl mx-auto">
          {/* Single Player */}
          <Card
            className="cursor-pointer hover:scale-105 transition-transform duration-300 game-card-glow border-2 border-primary/30 group"
            onClick={() => navigate("/game/single")}
          >
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center group-hover:pulse-glow transition-all">
                <User className="w-10 h-10 text-primary" />
              </div>
              <h3 className="text-2xl font-display mb-2 text-foreground">Single Player</h3>
              <p className="text-muted-foreground mb-4">
                Solve banana puzzles within 60 seconds per round. Complete 5 rounds to win!
              </p>
              <div className="flex justify-center gap-2 text-sm">
                <span className="bg-primary/10 px-3 py-1 rounded-full text-foreground">⏱ 60s Timer</span>
                <span className="bg-secondary/10 px-3 py-1 rounded-full text-foreground">🎯 5 Rounds</span>
              </div>
            </CardContent>
          </Card>

          {/* Multiplayer */}
          <Card
            className="cursor-pointer hover:scale-105 transition-transform duration-300 game-card-glow border-2 border-secondary/30 group"
            onClick={() => navigate("/game/multiplayer")}
          >
            <CardContent className="p-8 text-center">
              <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-secondary/20 flex items-center justify-center group-hover:pulse-glow transition-all">
                <Users className="w-10 h-10 text-secondary" />
              </div>
              <h3 className="text-2xl font-display mb-2 text-foreground">Multiplayer</h3>
              <p className="text-muted-foreground mb-4">
                Challenge another player! First to answer wins the round. 5 rounds max!
              </p>
              <div className="flex justify-center gap-2 text-sm">
                <span className="bg-secondary/10 px-3 py-1 rounded-full text-foreground">👥 2 Players</span>
                <span className="bg-primary/10 px-3 py-1 rounded-full text-foreground">🏆 Compete</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Links */}
        <div className="flex justify-center gap-4 mt-12">
          <Button variant="outline" onClick={() => navigate("/leaderboard")}>
            <Trophy className="w-4 h-4 mr-2" />
            Leaderboard
          </Button>
          <Button variant="outline" onClick={() => navigate("/profile")}>
            <User className="w-4 h-4 mr-2" />
            My Profile
          </Button>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
