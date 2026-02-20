/**
 * Utility per generazione PDF con Puppeteer
 * Supporta sia ambiente locale che serverless (Vercel)
 */

export function isServerless(): boolean {
  return Boolean(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_VERSION ||
    process.env.NETLIFY
  );
}

export async function getPuppeteer() {
  if (isServerless()) {
    // Ambiente serverless: usa puppeteer-core + chromium
    const puppeteerCore = await import("puppeteer-core");
    const chromium = await import("@sparticuz/chromium");
    
    return {
      puppeteer: puppeteerCore.default,
      launchOptions: {
        args: chromium.default.args,
        executablePath: await chromium.default.executablePath(),
        headless: true,
      },
    };
  } else {
    // Ambiente locale: usa puppeteer standard
    const puppeteer = await import("puppeteer");
    
    return {
      puppeteer: puppeteer.default,
      launchOptions: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    };
  }
}

export async function htmlToPdfBuffer(html: string, baseUrl: string): Promise<Buffer> {
  const { puppeteer, launchOptions } = await getPuppeteer();
  
  let browser;
  try {
    browser = await puppeteer.launch(launchOptions);
    const page = await browser.newPage();
    
    // Sostituisci {{origin}} nel base href
    const htmlWithBase = html.replace(/\{\{origin\}\}/g, baseUrl);
    
    await page.setContent(htmlWithBase, { 
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    
    await page.emulateMediaType("print");
    
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: {
        top: "0mm",
        right: "0mm",
        bottom: "0mm",
        left: "0mm",
      },
    });
    
    return Buffer.from(pdfBuffer);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

