import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MockMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactPhone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  contactName?: string;

  @IsOptional()
  @IsString()
  contactId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  channel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  externalId?: string;
}
