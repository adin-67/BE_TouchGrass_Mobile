import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    example: 'Nguyen Van A',
    minLength: 3,
    maxLength: 50,
  })
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(50)
  fullName?: string;

  @ApiPropertyOptional({
    example: 'https://example.com/avatar.jpg',
    nullable: true,
  })
  @IsOptional()
  @IsUrl({
    require_protocol: true,
  })
  avatarUrl?: string | null;

  @ApiPropertyOptional({
    example: '2000-01-15',
    nullable: true,
  })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string | null;

  @ApiPropertyOptional({
    type: [String],
    example: ['Exercise every day', 'Reduce screen time'],
    maxItems: 10,
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({
    each: true,
  })
  @MaxLength(100, {
    each: true,
  })
  goals?: string[];
}
