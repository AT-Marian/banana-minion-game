import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, User, Trophy, Coins, Gamepad2, Star, Lock, Download } from "lucide-react";
import stickerChampion from "@/assets/sticker-champion.png";
import stickerThumbsup from "@/assets/sticker-thumbsup.png";
import stickerHero from "@/assets/sticker-hero.png";

const stickers = [
  { name: "Champion Banana", img: stickerChampion },
  { name: "Thumbs Up", img: stickerThumbsup },
  { name: "Super Hero", img: stickerHero },
];

const Profile = () => {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [username, setUsername] = useState(profile?.username ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [gameSessions, setGameSessions] = useState<any[]>([]);

  useEffect(() => {
    if (profile) setUsername(profile.username);
  }, [profile]);

  useEffect(() => {
    if (user) {
      supabase
        .from("game_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(10)
        .then(({ data }) => {
          if (data) setGameSessions(data);
        });
    }
  }, [user]);

  const handleUpdateProfile = async () => {
    if (!user || !username.trim()) return;

    const { error } = await supabase
      .from("profiles")
      .update({ username: username.trim() })
      .eq("user_id", user.id);

    if (error) {
      toast({ title: "Error updating profile", variant: "destructive" });
    } else {
      toast({ title: "Profile updated!" });
      await refreshProfile();
      setIsEditing(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      toast({ title: "Password must be at least 6 characters", variant: "destructive" });
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: "Error changing password", variant: "destructive" });
    } else {
      toast({ title: "Password changed!" });
      setNewPassword("");
    }
  };

  const downloadSticker = (img: string, name: string) => {
    const a = document.createElement("a");
    a.href = img;
    a.download = `${name}.png`;
    a.click();
  };

  const bonusStickers = Math.floor((profile?.coins ?? 0) / 100) * 10;
  const totalStickers = (profile?.stickers_earned ?? 0) + bonusStickers;

  return (
    <div className="min-h-screen sky-gradient">
      <header className="bg-card/80 backdrop-blur-sm border-b border-border p-4">
        <div className="container mx-auto flex items-center justify-between">
          <Button variant="ghost" onClick={() => navigate("/dashboard")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back
          </Button>
          <h1 className="text-2xl font-display text-primary">My Profile</h1>
          <div />
        </div>
      </header>

      <main className="container mx-auto py-8 px-4 max-w-3xl space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Trophy, label: "High Score", value: profile?.high_score ?? 0, color: "text-primary" },
            { icon: Coins, label: "Coins", value: profile?.coins ?? 0, color: "text-coin" },
            { icon: Gamepad2, label: "Games", value: profile?.games_played ?? 0, color: "text-secondary" },
            { icon: Star, label: "Stickers", value: totalStickers, color: "text-primary" },
          ].map(({ icon: Icon, label, value, color }) => (
            <Card key={label} className="text-center game-card-glow">
              <CardContent className="p-4">
                <Icon className={`w-8 h-8 mx-auto mb-2 ${color}`} />
                <p className="text-2xl font-display text-foreground">{value}</p>
                <p className="text-sm text-muted-foreground">{label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Edit Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display flex items-center gap-2">
              <User className="w-5 h-5" /> Edit Profile
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Username</Label>
              <div className="flex gap-2">
                <Input
                  value={username}
                  onChange={(e) => { setUsername(e.target.value); setIsEditing(true); }}
                />
                {isEditing && (
                  <Button onClick={handleUpdateProfile}>Save</Button>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label><Lock className="w-4 h-4 inline mr-1" />Change Password</Label>
              <div className="flex gap-2">
                <Input
                  type="password"
                  placeholder="New password (min 6 chars)"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
                <Button onClick={handleChangePassword} disabled={!newPassword}>
                  Update
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stickers Collection */}
        {totalStickers > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="font-display">🎨 My Stickers ({totalStickers})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                {stickers.slice(0, Math.min(totalStickers, stickers.length)).map((s) => (
                  <div key={s.name} className="text-center">
                    <img src={s.img} alt={s.name} className="w-24 h-24 mx-auto mb-2 hover:scale-110 transition-transform cursor-pointer" />
                    <p className="text-sm font-semibold text-foreground">{s.name}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1"
                      onClick={() => downloadSticker(s.img, s.name)}
                    >
                      <Download className="w-3 h-3 mr-1" /> Download
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Game History */}
        <Card>
          <CardHeader>
            <CardTitle className="font-display">📊 Recent Games</CardTitle>
          </CardHeader>
          <CardContent>
            {gameSessions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">No games played yet!</p>
            ) : (
              <div className="space-y-2">
                {gameSessions.map((session) => (
                  <div
                    key={session.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        session.mode === "single"
                          ? "bg-primary/20 text-foreground"
                          : "bg-secondary/20 text-foreground"
                      }`}>
                        {session.mode === "single" ? "Solo" : "Multi"}
                      </span>
                      <span className="text-foreground font-semibold">
                        Score: {session.score}/{session.max_rounds}
                      </span>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {new Date(session.created_at).toLocaleDateString()}
                    </span>
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

export default Profile;
