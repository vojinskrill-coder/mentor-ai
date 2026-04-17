import { Component, input, signal } from '@angular/core';

export interface ContentData {
  title?: string;
  body?: string;
  metaDescription?: string;
  keywords?: string[];
  wordCount?: number;
  readabilityScore?: number;
  images?: Array<{ url: string; alt: string; placement: string }>;
  blog?: { html: string; seoScore: number; slug?: string; tags?: string[] };
  instagram?: { caption: string; hashtags: string[]; imageIndex?: number };
  linkedin?: { post: string; articleTitle?: string };
  publishedUrls?: Array<{ channel: string; url: string; status: string }>;
}

@Component({
  selector: 'app-content-preview',
  standalone: true,
  template: `
    <div class="content-preview">
      <!-- Channel tabs -->
      <div class="channel-tabs">
        <button class="ch-tab" [class.active]="activeChannel() === 'blog'" (click)="activeChannel.set('blog')">Blog</button>
        <button class="ch-tab" [class.active]="activeChannel() === 'instagram'" (click)="activeChannel.set('instagram')">Instagram</button>
        <button class="ch-tab" [class.active]="activeChannel() === 'linkedin'" (click)="activeChannel.set('linkedin')">LinkedIn</button>
      </div>

      @if (activeChannel() === 'blog') {
        <div class="blog-preview">
          @if (content().blog?.html || content().body) {
            <div class="seo-bar">
              @if (content().blog?.seoScore !== undefined) {
                <span class="seo-score" [class]="getSeoClass()">SEO: {{ content().blog!.seoScore }}/100</span>
              }
              @if (content().wordCount) {
                <span class="word-count">{{ content().wordCount }} reci</span>
              }
              @if (content().readabilityScore) {
                <span class="readability">Citljivost: {{ content().readabilityScore }}</span>
              }
            </div>

            @if (content().metaDescription) {
              <div class="meta-preview">
                <div class="meta-title">{{ content().title }}</div>
                <div class="meta-desc">{{ content().metaDescription }}</div>
                @if (content().keywords?.length) {
                  <div class="meta-keywords">
                    @for (kw of content().keywords!; track kw) {
                      <span class="keyword-tag">{{ kw }}</span>
                    }
                  </div>
                }
              </div>
            }

            <div class="html-content" [innerHTML]="content().blog?.html || content().body"></div>
          } @else {
            <div class="empty">Blog sadrzaj nije dostupan.</div>
          }
        </div>
      }

      @if (activeChannel() === 'instagram') {
        <div class="instagram-preview">
          @if (content().instagram) {
            <div class="ig-image-area">
              @if (content().images?.length) {
                <img class="ig-image" [src]="content().images![content().instagram!.imageIndex ?? 0]?.url" [alt]="content().images![0]?.alt" />
              }
            </div>
            <div class="ig-caption">{{ content().instagram!.caption }}</div>
            <div class="ig-hashtags">
              @for (tag of content().instagram!.hashtags; track tag) {
                <span class="hashtag">#{{ tag }}</span>
              }
            </div>
          } @else {
            <div class="empty">Instagram sadrzaj nije dostupan.</div>
          }
        </div>
      }

      @if (activeChannel() === 'linkedin') {
        <div class="linkedin-preview">
          @if (content().linkedin) {
            <div class="li-post">{{ content().linkedin!.post }}</div>
            @if (content().linkedin!.articleTitle) {
              <div class="li-article">
                <span class="li-article-title">{{ content().linkedin!.articleTitle }}</span>
              </div>
            }
          } @else {
            <div class="empty">LinkedIn sadrzaj nije dostupan.</div>
          }
        </div>
      }

      <!-- Image gallery -->
      @if (content().images?.length) {
        <div class="image-gallery">
          <h4 class="gallery-title">Slike</h4>
          <div class="gallery-grid">
            @for (img of content().images!; track img.url) {
              <div class="gallery-item">
                <img [src]="img.url" [alt]="img.alt" class="gallery-img" />
                <span class="gallery-placement">{{ img.placement }}</span>
              </div>
            }
          </div>
        </div>
      }

      <!-- Published URLs -->
      @if (content().publishedUrls?.length) {
        <div class="published-urls">
          <h4 class="urls-title">Objavljeno</h4>
          @for (pub of content().publishedUrls!; track pub.url) {
            <a class="pub-link" [href]="pub.url" target="_blank" rel="noopener">
              <span class="pub-channel">{{ pub.channel }}</span>
              <span class="pub-status" [class]="'pub-' + pub.status">{{ pub.status }}</span>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .content-preview { display: flex; flex-direction: column; gap: 16px; }

    .channel-tabs { display: flex; gap: 4px; }
    .ch-tab {
      padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 500;
      cursor: pointer; background: transparent; border: 1px solid #21262D; color: #9CA3AF;
    }
    .ch-tab.active { background: #58A6FF; border-color: #58A6FF; color: #E6EDF3; }

    .seo-bar { display: flex; gap: 16px; padding: 8px 12px; background: #1C2128; border-radius: 6px; }
    .seo-score { font-size: 12px; font-weight: 600; }
    .seo-score.seo-good { color: #22c55e; }
    .seo-score.seo-ok { color: #C9A96E; }
    .seo-score.seo-bad { color: #ef4444; }
    .word-count, .readability { color: #6B7280; font-size: 12px; }

    .meta-preview {
      background: #1C2128; border-radius: 6px; padding: 12px;
      border-left: 3px solid #C9A96E;
    }
    .meta-title { color: #58A6FF; font-size: 14px; font-weight: 500; }
    .meta-desc { color: #9CA3AF; font-size: 12px; margin-top: 4px; }
    .meta-keywords { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .keyword-tag {
      background: #58A6FF20; color: #58A6FF; padding: 2px 8px;
      border-radius: 4px; font-size: 10px;
    }

    .html-content {
      background: #161B22; border-radius: 8px; padding: 20px;
      color: #E6EDF3; font-size: 14px; line-height: 1.7;
      max-height: 500px; overflow-y: auto;
    }

    .instagram-preview { background: #161B22; border-radius: 8px; padding: 16px; }
    .ig-image-area { aspect-ratio: 1; max-width: 400px; background: #1C2128; border-radius: 4px; overflow: hidden; margin-bottom: 12px; }
    .ig-image { width: 100%; height: 100%; object-fit: cover; }
    .ig-caption { color: #E6EDF3; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .ig-hashtags { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
    .hashtag { color: #58A6FF; font-size: 12px; }

    .linkedin-preview { background: #161B22; border-radius: 8px; padding: 16px; }
    .li-post { color: #E6EDF3; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
    .li-article {
      margin-top: 12px; padding: 12px; background: #1C2128; border-radius: 6px;
      border: 1px solid #21262D;
    }
    .li-article-title { color: #E6EDF3; font-weight: 600; font-size: 14px; }

    .image-gallery { margin-top: 8px; }
    .gallery-title { color: #E6EDF3; font-size: 13px; margin: 0 0 8px; }
    .gallery-grid { display: flex; gap: 8px; overflow-x: auto; }
    .gallery-item { position: relative; flex-shrink: 0; }
    .gallery-img { width: 120px; height: 80px; object-fit: cover; border-radius: 4px; }
    .gallery-placement {
      position: absolute; bottom: 4px; left: 4px;
      background: #0D1117cc; color: #E6EDF3; font-size: 9px;
      padding: 1px 4px; border-radius: 2px;
    }

    .published-urls { margin-top: 8px; }
    .urls-title { color: #E6EDF3; font-size: 13px; margin: 0 0 8px; }
    .pub-link {
      display: flex; gap: 8px; align-items: center; color: #58A6FF;
      text-decoration: none; font-size: 12px; margin-bottom: 4px;
    }
    .pub-channel { font-weight: 600; }
    .pub-published { color: #22c55e; }
    .pub-scheduled { color: #C9A96E; }
    .pub-draft { color: #6B7280; }

    .empty { color: #6B7280; text-align: center; padding: 40px; font-size: 13px; }
  `],
})
export class ContentPreviewComponent {
  content = input.required<ContentData>();
  activeChannel = signal<'blog' | 'instagram' | 'linkedin'>('blog');

  getSeoClass(): string {
    const score = this.content().blog?.seoScore ?? 0;
    if (score >= 70) return 'seo-good';
    if (score >= 40) return 'seo-ok';
    return 'seo-bad';
  }
}
