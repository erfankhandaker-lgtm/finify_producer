import { UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { PasswordService } from '@modules/transaction/password.service';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  const pinVerify = jest.fn();
  const signAsync = jest.fn();

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PasswordService, useValue: { PINVerify: pinVerify } },
        { provide: JwtService, useValue: { signAsync } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('treats username as MSISDN and password as PIN', async () => {
    pinVerify.mockResolvedValue({ Passwordmatch: true, AccountStatus: 0 });

    await expect(service.validateUser('447340815480', '445566')).resolves.toMatchObject({
      username: '447340815480',
    });
    expect(pinVerify).toHaveBeenCalledWith('445566', '447340815480');
  });

  it('rejects an invalid PIN', async () => {
    pinVerify.mockResolvedValue({ Passwordmatch: false, AccountStatus: 0 });

    await expect(service.validateUser('447340815480', 'wrong-pin')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
