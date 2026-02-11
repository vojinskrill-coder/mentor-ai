import { BadRequestException } from '@nestjs/common';
import { FileUploadService, UploadedFileType } from './file-upload.service';
import * as fs from 'fs';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  promises: {
    writeFile: jest.fn(),
    unlink: jest.fn(),
  },
}));

describe('FileUploadService', () => {
  let service: FileUploadService;

  beforeEach(() => {
    jest.clearAllMocks();
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    service = new FileUploadService();
  });

  describe('validateFile', () => {
    const validFile: UploadedFileType = {
      fieldname: 'icon',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('test'),
    };

    it('should not throw for valid PNG file', () => {
      expect(() => service.validateFile(validFile)).not.toThrow();
    });

    it('should not throw for valid JPEG file', () => {
      const jpegFile = { ...validFile, mimetype: 'image/jpeg' };
      expect(() => service.validateFile(jpegFile)).not.toThrow();
    });

    it('should throw BadRequestException for file exceeding 2MB', () => {
      const largeFile = { ...validFile, size: 3 * 1024 * 1024 };

      expect(() => service.validateFile(largeFile)).toThrow(BadRequestException);
      expect(() => service.validateFile(largeFile)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            type: 'validation_error',
            detail: expect.stringContaining('2MB'),
          }),
        })
      );
    });

    it('should throw BadRequestException for invalid file type', () => {
      const invalidFile = { ...validFile, mimetype: 'application/pdf' };

      expect(() => service.validateFile(invalidFile)).toThrow(BadRequestException);
      expect(() => service.validateFile(invalidFile)).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            type: 'validation_error',
            title: 'Invalid File Type',
          }),
        })
      );
    });

    it('should accept custom validation options', () => {
      const customOptions = {
        maxSizeBytes: 1024,
        allowedMimeTypes: ['image/gif'],
      };
      const smallGifFile = { ...validFile, mimetype: 'image/gif', size: 512 };

      expect(() =>
        service.validateFile(smallGifFile, customOptions)
      ).not.toThrow();
    });
  });

  describe('generateUniqueFilename', () => {
    it('should include tenant ID prefix', () => {
      const filename = service.generateUniqueFilename('tnt_test123', 'test.png');

      expect(filename).toMatch(/^tnt_test123_/);
    });

    it('should preserve file extension', () => {
      const pngFilename = service.generateUniqueFilename('tnt_test', 'image.png');
      const jpgFilename = service.generateUniqueFilename('tnt_test', 'photo.JPG');

      expect(pngFilename).toMatch(/\.png$/);
      expect(jpgFilename).toMatch(/\.jpg$/);
    });

    it('should generate unique filenames', () => {
      const filename1 = service.generateUniqueFilename('tnt_test', 'test.png');
      const filename2 = service.generateUniqueFilename('tnt_test', 'test.png');

      expect(filename1).not.toBe(filename2);
    });
  });

  describe('saveFile', () => {
    const validFile: UploadedFileType = {
      fieldname: 'icon',
      originalname: 'test.png',
      encoding: '7bit',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('test image data'),
    };

    it('should save file to disk', async () => {
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.saveFile(validFile, 'tnt_test123');

      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(result.filename).toMatch(/^tnt_test123_/);
      expect(result.originalName).toBe('test.png');
      expect(result.mimeType).toBe('image/png');
      expect(result.size).toBe(1024);
    });

    it('should return CDN-style URL path', async () => {
      (fs.promises.writeFile as jest.Mock).mockResolvedValue(undefined);

      const result = await service.saveFile(validFile, 'tnt_test123');

      expect(result.url).toMatch(/^\/uploads\/icons\//);
    });

    it('should validate file before saving', async () => {
      const invalidFile = { ...validFile, size: 5 * 1024 * 1024 };

      await expect(service.saveFile(invalidFile, 'tnt_test')).rejects.toThrow(
        BadRequestException
      );
      expect(fs.promises.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('deleteFile', () => {
    it('should delete file if it exists', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.promises.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.deleteFile('test.png');

      expect(fs.promises.unlink).toHaveBeenCalled();
    });

    it('should not throw if file does not exist', async () => {
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await expect(service.deleteFile('nonexistent.png')).resolves.not.toThrow();
      expect(fs.promises.unlink).not.toHaveBeenCalled();
    });
  });

  describe('getFilePath', () => {
    it('should return full file path', () => {
      const filePath = service.getFilePath('test.png');

      expect(filePath).toContain('test.png');
      expect(filePath).toContain('uploads');
      expect(filePath).toContain('icons');
    });
  });
});
