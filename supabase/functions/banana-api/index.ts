import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BananaApiResponse {
  question: string;
  solution: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auth client for verifying the user
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service role client for accessing question_solutions table (bypasses RLS)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    if (action === "get-question") {
      // Fetch from banana API
      const response = await fetch("http://marcconrad.com/uob/banana/api.php");
      const data: BananaApiResponse = await response.json();

      // Generate a question ID and store solution in database
      const questionId = crypto.randomUUID();
      await supabaseAdmin.from("question_solutions").insert({
        id: questionId,
        solution: data.solution,
      });

      return new Response(
        JSON.stringify({
          questionId,
          questionUrl: data.question,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action === "check-answer") {
      const body = await req.json();
      const { questionId, answer } = body;

      // Look up solution from database
      const { data: stored, error: fetchError } = await supabaseAdmin
        .from("question_solutions")
        .select("solution")
        .eq("id", questionId)
        .single();

      if (fetchError || !stored) {
        return new Response(
          JSON.stringify({ error: "Question expired or invalid" }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const correct = stored.solution === Number(answer);

      // Remove used question
      await supabaseAdmin.from("question_solutions").delete().eq("id", questionId);

      return new Response(
        JSON.stringify({ correct, solution: stored.solution }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid action. Use ?action=get-question or ?action=check-answer" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
