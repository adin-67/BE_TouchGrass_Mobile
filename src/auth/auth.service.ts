import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}
  async register(registerDto: RegisterDto) {
    const email = registerDto.email;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }
    const passwordHash = await argon2.hash(registerDto.password, {
      type: argon2.argon2id,
    });
    const createdUser = await this.usersService.createUser({
      fullName: registerDto.fullName,
      email: registerDto.email,
      passwordHash: passwordHash,
    });

    const accessToken = await this.jwtService.signAsync({
      sub: createdUser._id.toString(),
      role: createdUser.role,
    });

    return {
      accessToken: accessToken,
      user: {
        id: createdUser._id.toString(),
        fullName: createdUser.fullName,
        email: createdUser.email,
        avatarUrl: createdUser.avatarUrl,
        dateOfBirth: createdUser.dateOfBirth,
        goals: createdUser.goals,
        xp: createdUser.xp,
        level: createdUser.level,
        leafPoints: createdUser.leafPoints,
        unlockMinutesBalance: createdUser.unlockMinutesBalance,
        role: createdUser.role,
      },
    };
  }

  async login(loginDto: LoginDto) {
    const user = await this.usersService.findByEmailWithPassword(
      loginDto.email,
    );
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const passwordIsValid = await argon2.verify(
      user.passwordHash,
      loginDto.password,
    );
    if (!passwordIsValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user._id.toString(),
      role: user.role,
    });

    return {
      accessToken: accessToken,

      user: {
        id: user._id.toString(),
        fullName: user.fullName,
        email: user.email,
        avatarUrl: user.avatarUrl,
        dateOfBirth: user.dateOfBirth,
        goals: user.goals,
        xp: user.xp,
        level: user.level,
        leafPoints: user.leafPoints,
        unlockMinutesBalance: user.unlockMinutesBalance,
        role: user.role,
      },
    };
  }
}
