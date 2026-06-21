import { ApiProperty } from '@nestjs/swagger';

/** Tema disponível no catálogo de interesses (`GET /interests/catalog`). */
export class TopicDto {
  @ApiProperty({ example: 'ai' })
  slug!: string;

  @ApiProperty({ example: 'IA' })
  label!: string;

  static from(topic: { slug: string; label: string }): TopicDto {
    return { slug: topic.slug, label: topic.label };
  }
}
