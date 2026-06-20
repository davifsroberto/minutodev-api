import { ApiProperty } from '@nestjs/swagger';

import { User } from '@prisma/client';

/** Dados básicos do usuário autenticado expostos por `GET /auth/me`. */
export class AuthUserDto {
  @ApiProperty({ example: 'b3f1c2a4-5d6e-7f80-9a1b-2c3d4e5f6071' })
  id!: string;

  @ApiProperty({ example: 'ana@example.com' })
  email!: string;

  @ApiProperty({ example: 'Ana Desenvolvedora' })
  name!: string;

  @ApiProperty({
    example: 'https://lh3.googleusercontent.com/a/default-user',
    nullable: true,
    type: String,
  })
  avatarUrl!: string | null;

  static fromUser(user: User): AuthUserDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      avatarUrl: user.avatarUrl,
    };
  }
}
