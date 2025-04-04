const { NextRequest, NextResponse } = require("next/server");
const { GoogleGenAI } = require("@google/genai");

// Gemini 2.0 Flash API key from environment variables
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Remove.bg API key from environment variables
const REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY;


export async function POST(request) {
  try {
    // Parse the request body
    const {
      prompt,
      emotion,
      characterType = "anime",
      gender = "Female",
      universeType = "fantasy",
    } = await request.json();

    let removeBackground = true;

    // Define style based on characterType
    const style =
      characterType === "anime"
        ? "anime style"
        : characterType === "realistic"
        ? "photorealistic"
        : "cartoon style";

    // Create base prompt respecting gender
    let basePrompt;
    if (gender.toLowerCase() === "male") {
      basePrompt = `${style}: A handsome medieval peasant man with well-defined features, wearing simple but well-fitted period clothing appropriate for ${universeType} setting. Full body portrait facing forward`;
    } else {
      basePrompt = `${style}: A beautiful medieval peasant woman with graceful features, wearing a simple yet charming linen dress with an apron and a corset appropriate for ${universeType} setting. Full body portrait facing forward`;
    }

    // Adjust prompt based on emotion
    let characterPrompt;
    if (emotion === "happy") {
      if (gender.toLowerCase() === "male") {
        characterPrompt = `${basePrompt}. He has a bright smile, confident posture, and a joyful expression. He looks directly at the viewer with warmth and enthusiasm`;
      } else {
        characterPrompt = `${basePrompt}. She has rosy cheeks, tousled hair, and a playful smile. She looks directly at the viewer with warmth and enthusiasm`;
      }
    } else if (emotion === "sad") {
      characterPrompt = `${basePrompt}. A sad, melancholic character with downcast eyes`;
    } else {
      characterPrompt = `${basePrompt}. ${
        gender.toLowerCase() === "male" ? "He has" : "She has"
      } a neutral expression, dressed in attire fitting the ${universeType} setting`;
    }

    // Combine with user-provided prompt if available
    const finalPrompt = prompt
      ? `${prompt}, ${characterPrompt}`
      : characterPrompt;

    // Initialize Gemini API
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Generate image using Gemini 2.0 Flash
    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash-exp-image-generation",
      contents: finalPrompt,
      config: {
        responseModalities: ["Text", "Image"],
      },
    });

    // Extract base64 image data from response
    let imageBase64;
    for (const part of response.candidates[0].content.parts) {
      if (part.inlineData) {
        imageBase64 = part.inlineData.data;
        break;
      }
    }
    if (!imageBase64) {
      throw new Error("No image generated");
    }

    // Remove background if requested and API key is available
    if (removeBackground && REMOVE_BG_API_KEY) {
      try {
        const removeBackgroundResponse = await fetch(
          "https://api.remove.bg/v1.0/removebg",
          {
            method: "POST",
            headers: {
              "X-Api-Key": REMOVE_BG_API_KEY,
            },
            body: new URLSearchParams({
              image_file_b64: imageBase64,
              size: "auto",
              format: "png",
            }),
          }
        );

        if (removeBackgroundResponse.ok) {
          const removeBackgroundData = await removeBackgroundResponse.json();
          imageBase64 = removeBackgroundData.data.result_b64;
        } else {
          console.warn("Background removal failed, using original image");
        }
      } catch (bgRemovalError) {
        console.error("Error in background removal:", bgRemovalError);
      }
    }

    // Return the response with the image as a base64 data URI
    return NextResponse.json({
      image: `data:image/png;base64,${imageBase64}`,
      emotion,
      characterType,
      gender,
      source: "gemini",
      backgroundRemoved: removeBackground,
    });
  } catch (error) {
    console.error("Error in character generation:", error);
    return NextResponse.json(
      {
        error: "Failed to generate character",
        message: error.message,
        emotion: emotion || "default",
        characterType: characterType || "anime",
        gender: gender || "Female",
      },
      { status: 500 }
    );
  }
}