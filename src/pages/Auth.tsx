import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import bananaMascot from "@/assets/banana-mascot.png";

const validatePassword = (password: string): string | null => {
  if (password.length < 12) return "Password must be at least 12 characters.";
  if (!/^[A-Z]/.test(password)) return "Password must start with a capital letter.";
  if (!/[a-z]/.test(password)) return "Password must include lowercase letters.";
  if (!/[0-9]/.test(password)) return "Password must include a number.";
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return "Password must include a special character.";
  return null;
};

const Auth = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isLogin) {
        await signIn(email, password);
        navigate("/dashboard");
      } else {
        if (!username.trim()) {
          toast({ title: "Username required", variant: "destructive" });
          setLoading(false);
          return;
        }
        const pwError = validatePassword(password);
        if (pwError) {
          setPasswordError(pwError);
          setLoading(false);
          return;
        }
        await signUp(email, password, username);
        toast({
          title: "Account created!",
          description: "Please check your email to verify your account.",
        });
         navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen sky-gradient flex items-center justify-center p-4">
      <Card className="w-full max-w-md bounce-in game-card-glow border-2 border-primary/30">
        <CardHeader className="text-center">
          <img
            src={bananaMascot}
            alt="Banana Mascot"
            className="w-24 h-24 mx-auto mb-2 float-animation"
          />
          <CardTitle className="text-3xl font-display text-primary-foreground">
            {isLogin ? "Welcome Back!" : "Join the Fun!"}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {isLogin
              ? "Sign in to continue your banana adventure"
              : "Create an account to start playing"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!isLogin && (
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="BananaKing123"
                  required={!isLogin}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="banana@example.com"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (!isLogin) setPasswordError(validatePassword(e.target.value));
                  }}
                  placeholder="••••••••"
                  required
                  minLength={isLogin ? 6 : 12}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {!isLogin && passwordError && (
                <p className="text-sm text-destructive">{passwordError}</p>
              )}
              {!isLogin && !passwordError && password.length > 0 && (
                <p className="text-sm text-green-500">✓ Strong password</p>
              )}
            </div>
            <Button type="submit" className="w-full text-lg font-bold" disabled={loading}>
              {loading ? "Loading..." : isLogin ? "🍌 Sign In" : "🍌 Create Account"}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-secondary hover:underline font-semibold"
            >
              {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
            </button>
          </div>
          <div className="mt-2 text-center">
            <Link to="/" className="text-sm text-muted-foreground hover:underline">
              ← Back to Home
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;
