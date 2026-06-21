import { ApiProperty } from '@nestjs/swagger';

import { ArrayMaxSize, ArrayUnique, IsArray, IsString } from 'class-validator';

/** Body do `PUT /me/interests` — substitui o conjunto de interesses do usuário. */
export class UpdateInterestsDto {
  @ApiProperty({
    description:
      'Slugs dos temas de interesse. Substitui o conjunto atual; array ' +
      'vazio limpa os interesses (volta ao Radar Geral).',
    example: ['ai', 'frontend', 'cloud'],
    isArray: true,
    type: String,
  })
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  interests!: string[];
}
