import { plainToInstance, Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class MlKitLabelDto {
  @ApiProperty({ example: 'Plant' })
  @IsString()
  @MaxLength(100)
  text!: string;

  @ApiProperty({ example: 0.91, minimum: 0, maximum: 1 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence!: number;
}

export class SubmitPhotoVerificationDto {
  @ApiProperty({
    type: [MlKitLabelDto],
    description:
      'Danh sách nhãn ML Kit, gửi dưới dạng chuỗi JSON trong multipart/form-data',
    example: [{ text: 'Plant', confidence: 0.91 }],
  })
  @Transform(({ value }: { value: unknown }) => {
    let parsedValue = value;

    if (typeof value === 'string') {
      try {
        parsedValue = JSON.parse(value) as unknown;
      } catch {
        return value;
      }
    }

    return Array.isArray(parsedValue)
      ? parsedValue.map((label) => plainToInstance(MlKitLabelDto, label))
      : parsedValue;
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  labels!: MlKitLabelDto[];

  @ApiProperty({ example: '2026-08-11T10:30:00.000Z' })
  @IsISO8601()
  capturedAt!: string;
}
