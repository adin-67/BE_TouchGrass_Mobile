import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId } from 'class-validator';

export class StartUserTaskDto {
  @ApiProperty({
    description: 'ID của nhiệm vụ người dùng muốn nhận',
    example: '6a79dd4e2971fdd0986116bd',
  })
  @IsMongoId({
    message: 'taskId must be a valid MongoDB id',
  })
  taskId!: string;
}
