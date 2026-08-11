import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNumber, Min } from 'class-validator';

export class UpdateUserTaskProgressDto {
  @ApiProperty({
    description: 'Tiến độ mới của nhiệm vụ',
    example: 250,
    minimum: 0,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  progress!: number;
}
