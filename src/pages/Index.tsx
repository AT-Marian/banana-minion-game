import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Gamepad2, Trophy, Users } from "lucide-react";
import bananaMascot from "@/assets/banana-mascot.png";
import heroBg from "@/assets/hero-bg.jpg";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen sky-gradient flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{ backgroundImage: `url(${heroBg})` }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/80" />

      {/* Nav */}
      <header className="relative z-10 p-4">
        <div className="container mx-auto flex items-center justify-between">
          <h1 className="text-2xl font-display text-foreground drop-shadow-lg">🍌 Bananaaa</h1>
          {user ? (
            <Button onClick={() => navigate("/dashboard")} className="font-bold">
              Go to Dashboard
            </Button>
          ) : (
            <Button onClick={() => navigate("/auth")} variant="outline" className="font-bold bg-card/80 backdrop-blur-sm">
              Sign In
            </Button>
          )}
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 container mx-auto px-4 py-16 md:py-24">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left max-w-xl">
            <h2 className="text-5xl md:text-6xl font-display mb-4 text-foreground drop-shadow-lg slide-up">
              Let's Play <span className="text-primary">Bananaaa</span>!
            </h2>
            <p className="text-xl text-foreground/80 mb-8 drop-shadow slide-up" style={{ animationDelay: "0.1s" }}>
              Can you figure out what number the banana represents? Challenge yourself or compete with friends in this fun math game!
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start slide-up" style={{ animationDelay: "0.2s" }}>
              <Button
                size="lg"
                onClick={() => navigate(user ? "/dashboard" : "/auth")}
                className="text-lg font-bold h-14 px-8"
              >
                <Gamepad2 className="w-5 h-5 mr-2" />
                {user ? "Play Now" : "Get Started"}
              </Button>
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/leaderboard")}
                className="text-lg font-bold h-14 px-8 bg-card/80 backdrop-blur-sm"
              >
                <Trophy className="w-5 h-5 mr-2" />
                Leaderboard
              </Button>
            </div>
          </div>

          {/* Mascot */}
          <div className="float-animation">
            <img
              src={bananaMascot}
              alt="Banana Game Mascot"
              className="w-64 md:w-80 drop-shadow-2xl"
            />
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          {[
            {
              icon: Gamepad2,
              title: "Single Player",
              desc: "Test your skills! Solve 5 banana puzzles in 60 seconds each.",
            },
            {
              icon: Users,
              title: "Multiplayer",
              desc: "Challenge a friend! Compete head-to-head in real-time.",
            },
            {
              icon: Trophy,
              title: "Earn Rewards",
              desc: "Collect coins, unlock minion stickers, and climb the leaderboard!",
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="bg-card/80 backdrop-blur-sm rounded-2xl p-6 text-center border border-border hover:game-card-glow transition-all hover:scale-105 slide-up"
            >
              <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-primary/20 flex items-center justify-center">
                <Icon className="w-7 h-7 text-primary" />
              </div>
              <h3 className="text-xl font-display mb-2 text-foreground">{title}</h3>
              <p className="text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Index;
