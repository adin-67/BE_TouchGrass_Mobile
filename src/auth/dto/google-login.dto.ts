import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class GoogleLoginDto {
  @ApiProperty({
    description: 'Google ID token returned by Android Credential Manager',
  })
  @IsString()
  @MinLength(100)
  @MaxLength(10000)
  idToken!: string;
}
