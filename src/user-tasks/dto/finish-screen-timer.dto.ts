import { ApiProperty } from '@nestjs/swagger';
import { IsISO8601 } from 'class-validator';

export class FinishScreenTimerDto {
  @ApiProperty({
    example: '2026-08-11T11:00:00.000Z',
    description: 'Thời điểm Android phát hiện ACTION_SCREEN_OFF',
  })
  @IsISO8601()
  screenOffAt!: string;

  @ApiProperty({
    example: '2026-08-11T11:10:05.000Z',
    description: 'Thời điểm Android phát hiện ACTION_SCREEN_ON',
  })
  @IsISO8601()
  screenOnAt!: string;
}
