import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'Logs' })
export class LogModel {
  @PrimaryGeneratedColumn({ type: 'bigint' })
  id: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  level: string;

  @Column({ type: 'text', nullable: true })
  message: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt: Date;

  @Column({ type: 'text', default: process.env.SERVICE_NAME || 'nestjs_core' })
  appname: string;

  @Column({ type: 'text', nullable: true })
  transactionid: string;
}
