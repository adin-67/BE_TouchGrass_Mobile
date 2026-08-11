import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsLatitude,
  IsLongitude,
  IsNumber,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class GpsPointDto {
  @ApiProperty({ example: 10.762622 })
  @Type(() => Number)
  @IsLatitude()
  latitude!: number;

  @ApiProperty({ example: 106.660172 })
  @Type(() => Number)
  @IsLongitude()
  longitude!: number;

  @ApiProperty({
    description: 'Độ chính xác GPS tính bằng mét',
    example: 12,
    minimum: 0,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  accuracy!: number;

  @ApiProperty({
    description: 'Thời điểm thiết bị ghi nhận điểm GPS',
    example: '2026-08-11T08:00:00.000Z',
  })
  @IsDateString()
  timestamp!: string;
}

export class FinishGpsTrackingDto {
  @ApiProperty({
    type: [GpsPointDto],
    description: 'Các điểm GPS theo thứ tự thời gian',
  })
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => GpsPointDto)
  points!: GpsPointDto[];
}
