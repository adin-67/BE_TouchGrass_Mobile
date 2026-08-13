import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';

import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRoles } from '../users/schemas/user.schema';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TasksService } from './tasks.service';

@ApiTags('admin-tasks')
@ApiBearerAuth()
@Roles(UserRoles.ADMIN)
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/tasks')
export class AdminTasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  @ApiOperation({ summary: 'Admin lấy tất cả nhiệm vụ, kể cả đã vô hiệu hóa' })
  async findAll() {
    return await this.tasksService.findAllForAdmin();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin lấy chi tiết một nhiệm vụ' })
  @ApiParam({ name: 'id', description: 'MongoDB ID của Task' })
  async findById(@Param('id') taskId: string) {
    return await this.tasksService.findByIdForAdmin(taskId);
  }

  @Post()
  @ApiOperation({ summary: 'Admin tạo nhiệm vụ mới' })
  async create(@Body() createTaskDto: CreateTaskDto) {
    return await this.tasksService.create(createTaskDto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin cập nhật nhiệm vụ' })
  @ApiParam({ name: 'id', description: 'MongoDB ID của Task' })
  async update(
    @Param('id') taskId: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return await this.tasksService.update(taskId, updateTaskDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin vô hiệu hóa nhiệm vụ (xóa mềm)' })
  @ApiParam({ name: 'id', description: 'MongoDB ID của Task' })
  async deactivate(@Param('id') taskId: string) {
    return await this.tasksService.deactivate(taskId);
  }
}
