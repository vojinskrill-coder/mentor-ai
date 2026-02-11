import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { OnboardingService } from './onboarding.service';
import type { UploadedFileType } from '../file-upload/file-upload.service';
import { SetupCompanyDto, QuickWinDto, OnboardingCompleteDto, BusinessContextDto } from './dto/quick-win.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { SkipMfa } from '../auth/decorators/skip-mfa.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import type {
  OnboardingStatus,
  QuickTask,
  QuickWinResponse,
  OnboardingCompleteResponse,
} from '@mentor-ai/shared/types';

/**
 * Controller for onboarding quick win flow.
 * Handles the wizard for sub-5-minute first value experience.
 * Requires authentication but skips MFA (onboarding happens before MFA setup).
 */
@Controller('onboarding')
@UseGuards(JwtAuthGuard, MfaRequiredGuard)
@SkipMfa()
export class OnboardingController {
  private readonly logger = new Logger(OnboardingController.name);

  constructor(private readonly onboardingService: OnboardingService) {}

  /**
   * POST /api/onboarding/setup-company
   * Saves company details during onboarding step 1.
   */
  @Post('setup-company')
  @HttpCode(HttpStatus.OK)
  async setupCompany(
    @Body() dto: SetupCompanyDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: { success: boolean }; correlationId?: string }> {
    this.logger.log({
      message: 'Setting up company during onboarding',
      tenantId: user.tenantId,
      userId: user.userId,
      companyName: dto.companyName,
      industry: dto.industry,
      correlationId,
    });

    await this.onboardingService.setupCompany(
      user.tenantId,
      user.userId,
      dto.companyName,
      dto.industry,
      dto.description,
      dto.websiteUrl
    );

    return {
      data: { success: true },
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * POST /api/onboarding/upload-brochure
   * Extracts text from an uploaded PDF brochure for business context enrichment.
   */
  @Post('upload-brochure')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('brochure'))
  async uploadBrochure(
    @UploadedFile() file: UploadedFileType,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: { extractedText: string }; correlationId?: string }> {
    if (!file) {
      throw new BadRequestException({
        type: 'no_file',
        title: 'No File Uploaded',
        status: 400,
        detail: 'Please select a PDF file to upload',
      });
    }

    if (file.mimetype !== 'application/pdf') {
      throw new BadRequestException({
        type: 'invalid_file_type',
        title: 'Invalid File Type',
        status: 400,
        detail: 'Only PDF files are accepted',
      });
    }

    this.logger.log({
      message: 'Uploading brochure PDF for text extraction',
      tenantId: user.tenantId,
      userId: user.userId,
      fileName: file.originalname,
      fileSize: file.size,
      correlationId,
    });

    const extractedText = await this.onboardingService.extractBrochureText(file.buffer);

    this.logger.log({
      message: 'Brochure text extracted successfully',
      tenantId: user.tenantId,
      userId: user.userId,
      extractedLength: extractedText.length,
      correlationId,
    });

    return {
      data: { extractedText },
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * POST /api/onboarding/analyse-business
   * Generates AI-powered business analysis.
   */
  @Post('analyse-business')
  @HttpCode(HttpStatus.OK)
  async analyseBusiness(
    @Body() dto: BusinessContextDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: { output: string; generationTimeMs: number }; correlationId?: string }> {
    this.logger.log({
      message: 'Analysing business during onboarding',
      tenantId: user.tenantId,
      userId: user.userId,
      correlationId,
    });

    const result = await this.onboardingService.analyseBusiness(
      user.tenantId,
      user.userId,
      dto.businessState,
      dto.departments
    );

    return {
      data: result,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * POST /api/onboarding/create-business-brain
   * Auto-generates personalized tasks and focus areas.
   */
  @Post('create-business-brain')
  @HttpCode(HttpStatus.OK)
  async createBusinessBrain(
    @Body() dto: BusinessContextDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: { output: string; generationTimeMs: number }; correlationId?: string }> {
    this.logger.log({
      message: 'Creating business brain during onboarding',
      tenantId: user.tenantId,
      userId: user.userId,
      correlationId,
    });

    const result = await this.onboardingService.createBusinessBrain(
      user.tenantId,
      user.userId,
      dto.businessState,
      dto.departments
    );

    return {
      data: result,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * GET /api/onboarding/status
   * Returns the current onboarding status for the authenticated user.
   */
  @Get('status')
  async getStatus(
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: OnboardingStatus; correlationId?: string }> {
    this.logger.log({
      message: 'Getting onboarding status',
      tenantId: user.tenantId,
      userId: user.userId,
      correlationId,
    });

    const status = await this.onboardingService.getStatus(user.tenantId, user.userId);

    return {
      data: status,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * GET /api/onboarding/tasks
   * Returns all available quick tasks.
   */
  @Get('tasks')
  getAllTasks(
    @Headers('x-correlation-id') correlationId?: string
  ): { data: QuickTask[]; correlationId?: string } {
    const tasks = this.onboardingService.getAllTasks();

    return {
      data: tasks,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * GET /api/onboarding/tasks/:industry
   * Returns quick tasks filtered by industry/department.
   */
  @Get('tasks/:industry')
  getTasksByIndustry(
    @Param('industry') industry: string,
    @Headers('x-correlation-id') correlationId?: string
  ): { data: QuickTask[]; correlationId?: string } {
    this.logger.log({
      message: 'Getting tasks for industry',
      industry,
      correlationId,
    });

    const tasks = this.onboardingService.getTasksForIndustry(industry);

    return {
      data: tasks,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * POST /api/onboarding/quick-win
   * Executes the quick win task using AI.
   */
  @Post('quick-win')
  @HttpCode(HttpStatus.OK)
  async executeQuickWin(
    @Body() dto: QuickWinDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: QuickWinResponse; correlationId?: string }> {
    this.logger.log({
      message: 'Executing quick win',
      tenantId: user.tenantId,
      userId: user.userId,
      taskId: dto.taskId,
      industry: dto.industry,
      correlationId,
    });

    const result = await this.onboardingService.executeQuickWin(
      user.tenantId,
      user.userId,
      dto.taskId,
      dto.userContext,
      dto.industry
    );

    return {
      data: result,
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * POST /api/onboarding/complete
   * Completes onboarding, saves the note, and transitions tenant to ACTIVE.
   */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(
    @Body() dto: OnboardingCompleteDto,
    @CurrentUser() user: CurrentUserPayload,
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<{ data: OnboardingCompleteResponse; correlationId?: string }> {
    this.logger.log({
      message: 'Completing onboarding',
      tenantId: user.tenantId,
      userId: user.userId,
      taskId: dto.taskId,
      correlationId,
    });

    const result = await this.onboardingService.completeOnboarding(
      user.tenantId,
      user.userId,
      dto.taskId,
      dto.generatedOutput,
      dto.executionMode
    );

    return {
      data: result,
      ...(correlationId && { correlationId }),
    };
  }
}
