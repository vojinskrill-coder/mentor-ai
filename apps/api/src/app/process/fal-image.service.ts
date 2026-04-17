import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';

export interface FalImageResult {
  url: string;
  width: number;
  height: number;
  prompt: string;
  optimizedPrompt?: string;
  success: boolean;
  error?: string;
}

@Injectable()
export class FalImageService {
  private readonly logger = new Logger(FalImageService.name);
  private readonly apiKey: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly openClaw: OpenClawClientService,
  ) {
    this.apiKey = this.configService.get<string>('FAL_KEY', '');
  }

  /**
   * Generate a contextual scene image using text-to-image (schnell).
   */
  async generateImage(prompt: string): Promise<FalImageResult> {
    if (!this.apiKey) {
      return { url: '', width: 0, height: 0, prompt, success: false, error: 'FAL_KEY not configured' };
    }

    try {
      const optimized = await this.optimizePrompt(prompt, null);
      this.logger.log({ message: 'Generating scene', promptLength: optimized.length });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://fal.run/fal-ai/flux/schnell', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${this.apiKey}` },
        body: JSON.stringify({ prompt: optimized, image_size: { width: 1080, height: 1080 }, num_images: 1 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        return { url: '', width: 0, height: 0, prompt, success: false, error: `FAL.ai ${response.status}` };
      }

      const data = await response.json() as any;
      const image = data.images?.[0];
      if (!image?.url) return { url: '', width: 0, height: 0, prompt, success: false, error: 'No image URL' };

      return { url: image.url, width: image.width ?? 1080, height: image.height ?? 1080, prompt, optimizedPrompt: optimized, success: true };
    } catch (err) {
      return { url: '', width: 0, height: 0, prompt, success: false, error: String(err) };
    }
  }

  /**
   * Composite: Place real sculpture in described scene using Kontext.
   */
  async generateComposite(sculptureFileName: string, sceneDescription: string): Promise<FalImageResult> {
    if (!this.apiKey) {
      return { url: '', width: 0, height: 0, prompt: sceneDescription, success: false, error: 'FAL_KEY not configured' };
    }

    try {
      const fs = await import('fs');
      const path = await import('path');
      const filePath = path.join('C:/Users/tanjav/Downloads', sculptureFileName);

      if (!fs.existsSync(filePath)) {
        return { url: '', width: 0, height: 0, prompt: sceneDescription, success: false, error: `Photo not found: ${filePath}` };
      }

      const imageData = fs.readFileSync(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
      const dataUri = `data:${mime};base64,${imageData.toString('base64')}`;

      // Optimize the prompt through LLM reasoning
      const optimized = await this.optimizePrompt(sceneDescription, sculptureFileName);

      this.logger.log({ message: 'Kontext composite', sculpture: sculptureFileName, originalLen: sceneDescription.length, optimizedLen: optimized.length });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      const response = await fetch('https://fal.run/fal-ai/flux-pro/kontext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Key ${this.apiKey}` },
        body: JSON.stringify({
          prompt: optimized,
          image_url: dataUri,
          guidance_scale: 4.0,
          num_inference_steps: 28,
          output_format: 'png',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        this.logger.error(`Kontext error: ${response.status} ${errText.slice(0, 300)}`);
        return { url: '', width: 0, height: 0, prompt: sceneDescription, optimizedPrompt: optimized, success: false, error: `Kontext ${response.status}` };
      }

      const data = await response.json() as any;
      const image = data.images?.[0] ?? data.image;
      if (!image?.url) return { url: '', width: 0, height: 0, prompt: sceneDescription, success: false, error: 'No image URL' };

      this.logger.log({ message: 'Kontext generated', url: image.url });
      return { url: image.url, width: image.width ?? 1024, height: image.height ?? 1024, prompt: sceneDescription, optimizedPrompt: optimized, success: true };
    } catch (err) {
      return { url: '', width: 0, height: 0, prompt: sceneDescription, success: false, error: String(err) };
    }
  }

  /**
   * PROMPT OPTIMIZER — the brain between OpenClaw's creative brief and Kontext execution.
   *
   * Takes the agent's scene description and REASONS about:
   * 1. What can Kontext actually do with this sculpture photo?
   * 2. What would a real photographer set up for this shot?
   * 3. How to describe it so AI produces a believable result?
   * 4. What are the pitfalls to avoid?
   */
  private async optimizePrompt(agentPrompt: string, sculptureFile: string | null): Promise<string> {
    try {
      const sculptureDesc = sculptureFile
        ? this.getSculptureDescription(sculptureFile)
        : 'an abstract polished metal sculpture on dark marble pedestal';

      const optimizerPrompt = `You are a world-class art director and AI image prompt engineer. Your job is to transform a creative brief into the PERFECT prompt for the Kontext AI model (FAL.ai flux-pro).

CREATIVE BRIEF: "${agentPrompt}"
SCULPTURE: ${sculptureDesc}

STEP 1 — ANALYZE THE INTENT:
What story does this image need to tell? What emotion should the viewer feel? What should they understand about LSA (Luxury Statues Adria) from this single image? Think about what would make someone stop scrolling on Instagram.

STEP 2 — DETERMINE THE SCENE TYPE and reason about what Kontext should do:

IF the brief is about CRAFTSMANSHIP / WORKSHOP / MAKING PROCESS:
- Transform the sculpture to appear IN-PROGRESS: show it as rough unpolished metal with visible grinding marks, or as a clay/wax master mold, or with only one section mirror-polished while the rest is raw matte metal
- Add an artisan's weathered hands actively working on it — holding a polishing tool, grinding wheel nearby, metal filings on the work surface
- Workshop environment: heavy wooden workbench, industrial task lighting, specialized sculpture tools hanging on pegboard, leather apron visible
- The beauty is in the CONTRAST between the raw and finished sections

IF the brief is about INSTALLATION / DELIVERY / LOGISTICS:
- Keep the sculpture finished and pristine but show it being HANDLED
- Add 2 professionals in dark uniforms with white cotton gloves carefully guiding it
- Show equipment: custom wooden crate lined with grey foam, furniture dolly, laser level with red beam, bubble wrap
- Environment: the destination space (lobby, penthouse) with the sculpture being positioned, not yet settled
- Capture the TENSION and PRECISION of the moment

IF the brief is about INTERIOR PLACEMENT / TRANSFORMATION / CLIENT SPACE:
- Show the sculpture as the HERO of the room — it should command the entire space
- The room should feel incomplete without it — the sculpture IS the room's identity
- Specific luxury interior: name materials (Calacatta marble floor, walnut wall panels, brass fixtures)
- People if present: architect pointing, client gazing in awe, both dressed formally
- The image should make viewers think "I need this in MY space"

IF the brief is about CERTIFICATION / AUTHENTICITY / LIMITED EDITION:
- Show the certificate prominently WITH the sculpture — both must be visible
- Elegant presentation: certificate in a leather portfolio, placed on velvet surface beside the sculpture
- Add details that signal exclusivity: edition number visible, gold embossing, wax seal
- Lighting should be warm and intimate, like a private viewing

IF the brief is about DETAIL / MATERIAL / SURFACE:
- Extreme close-up of the sculpture's surface — fill 80% of the frame with polished metal
- Show the interplay of reflections, the depth of the chrome/bronze finish
- A single fingertip in white glove barely touching the surface — for scale and human connection
- Macro photography feel: f/2.8, razor-thin depth of field

IF the brief is about BRAND / LIFESTYLE / ASPIRATIONAL:
- Show the sculpture in an impossibly beautiful setting that represents the LSA client's lifestyle
- Penthouse at golden hour, yacht interior, private jet cabin, wine cellar, rooftop terrace at dusk
- No people — let the viewer insert themselves into the fantasy
- The sculpture should feel like it BELONGS there, not placed but PART of the architecture

IF the brief is about something else:
- Reason from first principles: what would a professional art photographer set up for this specific shot?
- What lighting would make the metallic surface look its best in this context?
- What details in the scene would reinforce the story?
- What would make this image DIFFERENT from a generic product photo?

STEP 3 — WRITE THE KONTEXT PROMPT:
Based on your reasoning, write ONE focused paragraph (80-120 words) that tells Kontext exactly what to create.
- First sentence: what happens to/around the sculpture (the key transformation)
- Then: specific environment details with exact materials and colors
- Then: lighting — direction, color temperature, quality, how it hits the reflective metal
- Then: any people — exact description of clothing, pose, position
- Then: camera angle and photography style
- Last: mood in one word

RETURN ONLY THE PROMPT PARAGRAPH. No reasoning, no labels, no explanation.`;

      // Isolated session — must NOT pollute the main agent's chat context.
      // Without this, prompt optimizer outputs (sculpture descriptions,
      // Kontext scene paragraphs) leak into the brain's context window
      // and surface in unrelated chat conversations as "Golden Flux"
      // hallucinations. Each call gets a unique throwaway session.
      const result = await this.openClaw.executeAgent(optimizerPrompt, {
        agentId: 'main',
        sessionId: `bg-falopt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timeoutSeconds: 3600,
      });

      if (result.success && result.output && result.output.length > 20) {
        this.logger.log({ message: 'Prompt optimized', originalLen: agentPrompt.length, optimizedLen: result.output.length });
        return result.output.trim();
      }

      // Fallback: use agent prompt with basic Kontext framing
      this.logger.warn('Prompt optimization failed, using fallback');
      return this.fallbackPrompt(agentPrompt);
    } catch (err) {
      this.logger.warn(`Prompt optimizer error: ${err}`);
      return this.fallbackPrompt(agentPrompt);
    }
  }

  private fallbackPrompt(agentPrompt: string): string {
    return `${agentPrompt}. Keep this exact sculpture — same shape, same polished metal finish, same marble pedestal. Seamlessly integrate into the scene with matched lighting and realistic shadows. Professional photography.`;
  }

  private getSculptureDescription(fileName: string): string {
    const descriptions: Record<string, string> = {
      'Eterna Harmonija Statua.png': 'Eterna Harmonia — a dark bronze abstract infinity/figure-8 flowing form with matte chrome finish on cylindrical black marble pedestal, 180cm tall',
      'Nebeski Uzlazak Statua.png': 'Nebeski Uzlazak — a silver mirror-polished chrome rising flame/wing form with dramatic upward curves on cylindrical black marble pedestal, 180cm tall',
      'Golden Flux Statue.png': 'Golden Flux — a 24k gold polished double-curve S-shape abstract form with blue reflective accents on light marble pedestal',
      'Sertifikat.png': 'Official LSA Certificate of Authenticity — dark background with gold text, gold seal, signature, and sculpture photo',
    };
    return descriptions[fileName] ?? 'an abstract polished metal sculpture on dark marble pedestal';

  }
}
