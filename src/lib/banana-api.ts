import { supabase } from "@/integrations/supabase/client";

export async function getQuestion() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/banana-api?action=get-question`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) throw new Error("Failed to fetch question");
  return res.json() as Promise<{ questionId: string; questionUrl: string }>;
}

export async function checkAnswer(questionId: string, answer: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Not authenticated");

  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  const res = await fetch(
    `https://${projectId}.supabase.co/functions/v1/banana-api?action=check-answer`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ questionId, answer }),
    }
  );

  if (!res.ok) throw new Error("Failed to check answer");
  return res.json() as Promise<{ correct: boolean; solution: number }>;
}
