import { ApiProperty } from '@nestjs/swagger';

/** Interesses atuais do usuário. Array vazio = sem preferências (Radar Geral). */
export class InterestsResponseDto {
  @ApiProperty({
    description: 'Slugs dos temas que o usuário selecionou.',
    example: ['ai', 'frontend', 'cloud'],
    isArray: true,
    type: String,
  })
  interests!: string[];

  static from(slugs: string[]): InterestsResponseDto {
    return { interests: slugs };
  }
}
