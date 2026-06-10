import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// AES-256-GCM helpers using Web Crypto API
const ENC_PREFIX = "ENC:";

async function getKey(): Promise<CryptoKey> {
  const rawKey = Deno.env.get("SALARY_ENCRYPTION_KEY");
  if (!rawKey) throw new Error("SALARY_ENCRYPTION_KEY secret not configured");
  // Derive a 256-bit key from the secret using SHA-256
  const keyMaterial = new TextEncoder().encode(rawKey);
  const hashBuffer = await crypto.subtle.digest("SHA-256", keyMaterial);
  return crypto.subtle.importKey("raw", hashBuffer, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptValue(key: CryptoKey, plaintext: string): Promise<string> {
  if (!plaintext && plaintext !== "0") return "";
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(String(plaintext));
  const cipherBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const ivB64 = btoa(String.fromCharCode(...iv));
  const cipherB64 = btoa(String.fromCharCode(...new Uint8Array(cipherBuf)));
  return `${ENC_PREFIX}${ivB64}:${cipherB64}`;
}

async function decryptValue(key: CryptoKey, ciphertext: string): Promise<string> {
  if (!ciphertext || !ciphertext.startsWith(ENC_PREFIX)) return ciphertext ?? "";
  const parts = ciphertext.slice(ENC_PREFIX.length).split(":");
  if (parts.length !== 2) return "";
  const iv = Uint8Array.from(atob(parts[0]), (c) => c.charCodeAt(0));
  const cipher = Uint8Array.from(atob(parts[1]), (c) => c.charCodeAt(0));
  const plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, cipher);
  return new TextDecoder().decode(plainBuf);
}

async function getUserRole(supabase: ReturnType<typeof createClient>, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("profiles")
    .select("role:roles(nombre)")
    .eq("id", userId)
    .maybeSingle();
  return (data as { role?: { nombre?: string } } | null)?.role?.nombre ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verify the user JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action, values } = body as { action: "encrypt" | "decrypt"; values: string[] };

    if (!action || !Array.isArray(values)) {
      return new Response(JSON.stringify({ error: "Invalid request body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For decrypt: only Administrador role allowed
    if (action === "decrypt") {
      const roleName = await getUserRole(supabase, user.id);
      if (roleName !== "Administrador") {
        return new Response(JSON.stringify({ error: "Forbidden: only Administrador can decrypt sensitive data" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const key = await getKey();
    let result: string[];

    if (action === "encrypt") {
      result = await Promise.all(values.map((v) => encryptValue(key, String(v ?? ""))));
    } else {
      result = await Promise.all(values.map((v) => decryptValue(key, String(v ?? ""))));
    }

    return new Response(JSON.stringify({ result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("mano-obra-crypto error:", err);
    return new Response(JSON.stringify({ error: "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
