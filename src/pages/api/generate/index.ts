import type { APIRoute } from "astro";
import { createNewSr } from "../../../lib/generateUnison";

export const GET: APIRoute = () => {
  return new Response(JSON.stringify({ status: "API route is working" }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
};

export const POST: APIRoute = async ({ request }) => {
  console.log("🚀 POST request received");

  try {
    console.log("📝 Request method:", request.method);
    console.log(
      "🔍 Request headers:",
      Object.fromEntries([...request.headers])
    );

    let params;
    const rawBody = await request.text();
    console.log("📦 Raw request body:", rawBody);

    try {
      params = JSON.parse(rawBody);
      console.log("✅ Parsed params:", params);
    } catch (error: any) {
      console.error("❌ JSON parse error:", error);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Failed to parse request body as JSON",
          details: error?.message || "Unknown error",
          rawBody,
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }

    // Validate required parameters
    if (!params.rhythms || !Array.isArray(params.rhythms)) {
      console.error("❌ Missing or invalid rhythms");
      throw new Error("Missing or invalid rhythms parameter");
    }
    if (!params.timeSig || typeof params.timeSig !== "object") {
      console.error("❌ Missing or invalid timeSig");
      throw new Error("Missing or invalid timeSig parameter");
    }
    if (!params.measures || typeof params.measures !== "number") {
      console.error("❌ Missing or invalid measures");
      throw new Error("Missing or invalid measures parameter");
    }
    if (!params.range || typeof params.range !== "object") {
      console.error("❌ Missing or invalid range");
      throw new Error("Missing or invalid range parameter");
    }

    console.log("✅ All parameters validated");

    // Transform params to match what createNewSr expects
    const transformedParams = {
      ...params,
      selectedRhythms: params.rhythms,
      selectedTimeSignature: params.selectedTimeSignature,
    };

    console.log(
      "🎵 Calling createNewSr with transformed params:",
      transformedParams
    );

    const generatedString = createNewSr(transformedParams);
    console.log("🎼 Generated string:", generatedString);

    if (!generatedString || !Array.isArray(generatedString)) {
      console.error("❌ Invalid generated string format");
      throw new Error("Invalid generated string format");
    }

    console.log("✅ Sending successful response");
    return new Response(
      JSON.stringify({ success: true, data: generatedString }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("❌ Generation error:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });

    return new Response(
      JSON.stringify({
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to generate music",
        details: error instanceof Error ? error.stack : undefined,
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
  }
};
