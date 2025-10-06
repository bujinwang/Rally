import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { Request } from 'express';

// Configure storage
const storage = multer.diskStorage({
  destination: async (req: Request, file: Express.Multer.File, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/avatars');
    
    // Create directory if it doesn't exist
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error as Error, uploadDir);
    }
  },
  filename: (req: Request, file: Express.Multer.File, cb) => {
    // Generate unique filename
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

// File filter - only allow images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.'));
  }
};

// Configure multer
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  }
});

// Delete file utility
export async function deleteFile(filePath: string): Promise<void> {
  try {
    // Remove leading slash if present
    const cleanPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = path.join(__dirname, '../../', cleanPath);
    
    await fs.unlink(fullPath);
  } catch (error) {
    console.error('Error deleting file:', error);
    // Don't throw - file might not exist
  }
}

// Get file URL
export function getFileUrl(filePath: string): string {
  if (!filePath) return '';
  
  // If already a full URL, return as is
  if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
    return filePath;
  }
  
  // Otherwise, construct URL based on server config
  const baseUrl = process.env.API_BASE_URL || 'http://localhost:3001';
  return `${baseUrl}${filePath.startsWith('/') ? '' : '/'}${filePath}`;
}

// Validate image dimensions (optional advanced feature)
export async function validateImageDimensions(
  filePath: string,
  options: { minWidth?: number; minHeight?: number; maxWidth?: number; maxHeight?: number }
): Promise<{ valid: boolean; error?: string }> {
  // TODO: Implement using sharp library if needed
  // import sharp from 'sharp';
  // const metadata = await sharp(filePath).metadata();
  // Check dimensions against options
  
  return { valid: true };
}

// Resize image (optional advanced feature)
export async function resizeImage(
  inputPath: string,
  outputPath: string,
  width: number,
  height: number
): Promise<void> {
  // TODO: Implement using sharp library if needed
  // import sharp from 'sharp';
  // await sharp(inputPath)
  //   .resize(width, height, { fit: 'cover' })
  //   .toFile(outputPath);
}
