import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({ example: 'secure-reset-token' })
  @IsString()
  @MinLength(32)
  @MaxLength(200)
  token!: string;

  @ApiProperty({ example: 'NewPassword123', minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword!: string;
}
