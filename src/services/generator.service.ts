import * as fs from 'fs';
import * as path from 'path';
import Handlebars from 'handlebars';
import puppeteer from 'puppeteer';
import { PropertyListing } from '../types/property';
import { ENV } from '../config';
import logger from '../utils/logger';

function loadTemplate(templateName: string): string {
  const templatePath = path.resolve(process.cwd(), 'templates', `${templateName}.html`);
  if (!fs.existsSync(templatePath)) {
    const fallback = path.resolve(process.cwd(), 'templates', 'standard.html');
    if (fs.existsSync(fallback)) {
      return fs.readFileSync(fallback, 'utf-8');
    }
    throw new Error(`テンプレートが見つかりません: ${templatePath}`);
  }
  return fs.readFileSync(templatePath, 'utf-8');
}

export async function generateOverviewPdf(
  listing: Partial<PropertyListing>,
  templateName: string = 'standard'
): Promise<Buffer> {
  logger.info(`物件概要書PDF生成: ${listing.caseId} (${templateName})`);

  const templateSource = loadTemplate(templateName);
  const template = Handlebars.compile(templateSource);

  const html = template({
    ...listing,
    agentName: ENV.AGENT_NAME,
    companyName: ENV.COMPANY_NAME,
    generatedDate: new Date().toLocaleDateString('ja-JP'),
    priceMlanEnFormatted: listing.priceMlanEn ? `${listing.priceMlanEn.toLocaleString()}万円` : '—',
    landAreaFormatted: listing.landAreaM2 ? `${listing.landAreaM2}㎡` : '—',
    buildingAreaFormatted: listing.buildingAreaM2 ? `${listing.buildingAreaM2}㎡` : '—',
    walkFormatted: listing.walkMinutes ? `徒歩${listing.walkMinutes}分` : '—',
    coverageFormatted: listing.coverageRatio ? `${listing.coverageRatio}%` : '—',
    floorAreaFormatted: listing.floorAreaRatio ? `${listing.floorAreaRatio}%` : '—',
  });

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });

    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15mm', right: '15mm', bottom: '15mm', left: '15mm' },
    });

    logger.info(`PDF生成完了: ${listing.caseId} (${pdfBuffer.length} bytes)`);
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) await browser.close();
  }
}

export function getOverviewFileName(caseId: string): string {
  return `物件概要書_${caseId}_${new Date().toISOString().slice(0, 10)}.pdf`;
}
