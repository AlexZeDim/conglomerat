import { CMNW_ENTITY_ENUM } from '@app/pg';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Index('ix__characters_pets__pet_id', ['pet_id'], {})
@Index('ix__characters_pets__character_guid', ['character_guid'], {})
@Entity({ name: CMNW_ENTITY_ENUM.CHARACTERS_PETS })
export class CharactersPetsEntity {
  @PrimaryGeneratedColumn('uuid')
  readonly uuid: string;

  @Column({
    nullable: false,
    type: 'int',
    name: 'pet_id',
  })
  petId: number;

  @Column({
    nullable: false,
    type: 'varchar',
    name: 'character_guid',
  })
  characterGuid: string;

  @Column({
    nullable: true,
    type: 'varchar',
    name: 'pet_name',
  })
  petName: string;

  @Column({
    default: 1,
    nullable: true,
    type: 'integer',
    name: 'pet_level',
  })
  petLevel: number;

  @Column({
    default: false,
    nullable: false,
    type: 'boolean',
    name: 'is_active',
  })
  isActive?: boolean;

  @CreateDateColumn({
    type: 'timestamp with time zone',
    name: 'created_at',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt?: Date;

  @UpdateDateColumn({
    type: 'timestamp with time zone',
    name: 'updated_at',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  updatedAt?: Date;
}
