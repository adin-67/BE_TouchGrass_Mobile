import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

import { UserTaskStatus } from '../schemas/user-task.schema';

export class ListUserTasksQueryDto {
  @ApiPropertyOptional({
    description: 'Số trang',
    default: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Số bản ghi trên một trang',
    default: 10,
    minimum: 1,
    maximum: 50,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  @IsOptional()
  limit: number = 10;

  @ApiPropertyOptional({
    description: 'Lọc theo trạng thái nhiệm vụ',
    enum: UserTaskStatus,
  })
  @IsEnum(UserTaskStatus)
  @IsOptional()
  status?: UserTaskStatus;
}
