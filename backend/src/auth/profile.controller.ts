import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Patch,
  Post,
  Req,
  StreamableFile,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { PrismaService } from '../prisma/prisma.service.js';
import {
  JwtAuthGuard,
  type AuthenticatedRequest,
} from './jwt-auth.guard.js';

/**
 * Authenticated profile management.
 *
 * This is a new controller alongside the existing AuthController.
 * It does not modify registration, login, /auth/me, or task endpoints.
 *
 * Photos are saved to a private directory on the backend server.
 * They can only be fetched with the owner's valid access token.
 * For cloud deployments, move photo storage to durable object storage.
 */
const PHOTO_DIRECTORY = join(process.cwd(), 'uploads', 'profile-photos');
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_EXTENSIONS = ['jpg', 'png', 'webp'] as const;
type PhotoExtension = (typeof PHOTO_EXTENSIONS)[number];

class UpdateMyProfileDto {
  @IsString()
  @IsNotEmpty({ message: 'Please enter your name.' })
  @Matches(/\S/, { message: 'Please enter your name.' })
  @MaxLength(100, { message: 'Your name should be 100 characters or fewer.' })
  name!: string;
}

interface UploadedPhoto {
  buffer: Buffer;
  size: number;
}

/** Check file signatures rather than trusting file names or MIME headers. */
function detectPhotoType(buffer: Buffer): PhotoExtension | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) return 'jpg';

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) return 'png';

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';

  return null;
}

/** The authenticated ID is used only if safe for a file name. */
function photoName(userId: string, extension: PhotoExtension): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(userId)) {
    throw new UnauthorizedException('Please sign in again.');
  }
  return join(PHOTO_DIRECTORY, `avatar-${userId}.${extension}`);
}

function authenticatedUserId(request: AuthenticatedRequest): string {
  const userId = request.user?.id;
  if (userId === undefined || userId === null) {
    throw new UnauthorizedException('Please sign in again.');
  }
  return String(userId);
}

@Controller('auth')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly prisma: PrismaService) {}

  /** PATCH /auth/me — name only. Email changes require verification. */
  @Patch('me')
  @Header('Cache-Control', 'no-store')
  async updateMe(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UpdateMyProfileDto,
  ) {
    const id = authenticatedUserId(request);
    const name = dto.name.trim().replace(/\s+/g, ' ');
    if (!name) throw new BadRequestException('Please enter your name.');

    return this.prisma.user.update({
      where: { id },
      data: { name },
      select: { id: true, name: true, email: true, createdAt: true },
    });
  }

  /** GET /auth/me/photo — private image, not a public static URL. */
  @Get('me/photo')
  @Header('Cache-Control', 'private, no-store')
  async getMyPhoto(@Req() request: AuthenticatedRequest): Promise<StreamableFile> {
    const userId = authenticatedUserId(request);
    for (const extension of PHOTO_EXTENSIONS) {
      try {
        const photo = await readFile(photoName(userId, extension));
        const type = extension === 'jpg' ? 'image/jpeg' : `image/${extension}`;
        return new StreamableFile(photo, { type });
      } catch (error: unknown) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
    throw new NotFoundException('You have not added a profile photo yet.');
  }

  /** POST /auth/me/photo — upload a JPG, PNG, or WebP up to 2 MB. */
  @Post('me/photo')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: MAX_PHOTO_BYTES } }))
  async uploadMyPhoto(
    @Req() request: AuthenticatedRequest,
    @UploadedFile() photo?: UploadedPhoto,
  ) {
    const userId = authenticatedUserId(request);
    if (!photo?.buffer?.length || !photo.size) {
      throw new BadRequestException('Please choose a photo to upload.');
    }
    if (photo.size > MAX_PHOTO_BYTES) {
      throw new BadRequestException('Please choose a photo smaller than 2 MB.');
    }

    const extension = detectPhotoType(photo.buffer);
    if (!extension) {
      throw new BadRequestException('Please use a JPG, PNG, or WebP photo.');
    }

    await mkdir(PHOTO_DIRECTORY, { recursive: true });
    const destination = photoName(userId, extension);
    const temporary = join(PHOTO_DIRECTORY, `upload-${randomUUID()}.tmp`);
    try {
      await writeFile(temporary, photo.buffer, { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } finally {
      await unlink(temporary).catch(() => undefined);
    }

    // Remove any old image of a different type after saving the new one.
    await Promise.all(PHOTO_EXTENSIONS.filter((ext) => ext !== extension).map(
      (ext) => unlink(photoName(userId, ext)).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }),
    ));
    return { message: 'Your profile photo has been updated.' };
  }

  /** DELETE /auth/me/photo — only the signed-in user's photo. */
  @Delete('me/photo')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeMyPhoto(@Req() request: AuthenticatedRequest): Promise<void> {
    const userId = authenticatedUserId(request);
    await Promise.all(PHOTO_EXTENSIONS.map((ext) =>
      unlink(photoName(userId, ext)).catch((error: unknown) => {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }),
    ));
  }
}
