import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execFileP = promisify(execFile);

export interface PageImage {
  pageNumber: number;
  imagePath: string;
  width: number;
  height: number;
}

// Rasterise every page of `pdfPath` at 300 DPI into `outputDir`.
// Uses poppler's `pdftocairo` — same output shape as pdf2pic (one
// PNG per page) but no GraphicsMagick / Ghostscript dependency.
export async function convertPdfToImages(
  pdfPath: string,
  outputDir: string
): Promise<PageImage[]> {
  await fs.mkdir(outputDir, { recursive: true });

  const prefix = path.join(outputDir, 'page');
  await execFileP('pdftocairo', ['-png', '-r', '300', pdfPath, prefix]);

  const files = (await fs.readdir(outputDir))
    .filter((f) => f.startsWith('page-') && f.endsWith('.png'))
    .sort();

  return files.map((f) => {
    const num = parseInt(f.replace(/^page-|\.png$/g, ''), 10);
    return {
      pageNumber: num,
      imagePath: path.join(outputDir, f),
      width: 2480,
      height: 3508,
    };
  });
}

export async function preprocessImage(imagePath: string): Promise<string> {
  const sharp = (await import('sharp')).default;
  const outputPath = imagePath.replace('.png', '_processed.png');

  await sharp(imagePath)
    .greyscale()
    .normalize()
    .sharpen({ sigma: 1.5, m1: 0.5, m2: 0.5 })
    .png({ quality: 100 })
    .toFile(outputPath);

  return outputPath;
}
