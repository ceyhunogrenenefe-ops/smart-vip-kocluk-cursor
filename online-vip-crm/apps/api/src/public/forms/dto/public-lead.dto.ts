import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

/**
 * Accepts both camelCase and the public website form field names
 * from the master prompt (name/surname/student_name/...).
 */
export class PublicLeadFormDto {
  @IsOptional()
  @IsUUID()
  institutionId?: string;

  @IsOptional()
  @IsUUID()
  institution_id?: string;

  /** Combined full name — or derived from name + surname. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  surname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  student_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade_level?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  grade?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  program?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  examTarget?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  form_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utm_source?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utm_medium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utm_campaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utm_content?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  utm_term?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  page_url?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === 1)
  @IsBoolean()
  consent?: boolean;

  /** Honeypot — if filled, treat as spam. */
  @IsOptional()
  @IsString()
  website?: string;

  resolveDisplayName(): string {
    if (this.fullName?.trim()) return this.fullName.trim();
    const parts = [this.name, this.surname].filter(Boolean);
    if (parts.length) return parts.join(' ').trim();
    return 'Web Form Lead';
  }
}
