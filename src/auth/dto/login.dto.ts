import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
export class LoginDto {
  @ApiProperty({
    example: 'test1@touchgrass.local',
    maxLength: 254,
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    example: 'Test12345!',
    maxLength: 128,
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password!: string;
}
