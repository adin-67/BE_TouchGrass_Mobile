import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

export const PACKAGE_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/;

export class PackageFieldsDto {
  @ApiProperty({ example: 'com.example.social' })
  @IsString()
  @MaxLength(200)
  @Matches(PACKAGE_NAME_PATTERN, {
    message: 'packageName must be a valid Android package name',
  })
  packageName!: string;

  @ApiProperty({ example: 'Example Social' })
  @IsString()
  @MaxLength(100)
  appName!: string;
}

export class AllowlistFieldsDto extends PackageFieldsDto {
  @ApiPropertyOptional({ example: 'Needed for work' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
