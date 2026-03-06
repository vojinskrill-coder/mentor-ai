import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import puppeteer, { type Browser } from 'puppeteer';

@Injectable()
export class PuppeteerProvider implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PuppeteerProvider.name);
  private browser: Browser | null = null;

  async onModuleInit(): Promise<void> {
    this.logger.log('Launching Puppeteer browser...');
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    });
    this.logger.log('Puppeteer browser launched');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.logger.log('Puppeteer browser closed');
    }
  }

  getBrowser(): Browser {
    if (!this.browser) {
      throw new Error('Puppeteer browser not initialized');
    }
    return this.browser;
  }
}
