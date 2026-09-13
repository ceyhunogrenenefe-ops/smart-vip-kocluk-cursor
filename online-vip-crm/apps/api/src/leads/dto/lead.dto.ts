import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class UpdateLeadStageDto {
  /** Pipeline stage id (UUID) — preferred */
  @IsOptional()
  @IsUUID()
  stageId?: string;

  /** Stage key fallback (e.g. new_request, enrolled) */
  @IsOptional()
  @IsString()
  @MaxLength(64)
  stageKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
