import { Contracts, type ArtDirectionRequest, type Profile, type Settings } from '../shared/Contracts';
import type { ArtDirectionPort } from './ArtDirectionPort';
import { PromptCatalog } from './prompts/PromptCatalog';

export class ArtDirectionService {
  private busy = false;
  constructor(
    private readonly makeProvider: (settings: Settings, profile: Profile) => ArtDirectionPort,
    private readonly prompts: PromptCatalog,
  ) {}
  async suggest(input: ArtDirectionRequest, settings: Settings, profile: Profile) {
    const request = Contracts.artDirectionRequest.parse(input);
    if (this.busy) throw new Error('Art direction is already being generated.');
    this.busy = true;
    try {
      const prompt = this.prompts.render('artDirection', {
        language: 'English',
        rules: JSON.stringify(profile.rules),
        brief: JSON.stringify({ theme: request.theme, wishes: request.wishes }),
      });
      return Contracts.artDirectionResult.parse(
        await this.makeProvider(settings, profile).suggestArtDirection(prompt),
      );
    } finally {
      this.busy = false;
    }
  }
}
