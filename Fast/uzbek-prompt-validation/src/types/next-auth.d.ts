import { DefaultSession } from "next-auth";
import { JWT } from "next-auth/jwt";
import { RoleName } from "@prisma/client";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      id: string;
      roles: RoleName[];
      isActive: boolean;
    };
  }

  interface User {
    id: string;
    roles: RoleName[];
    isActive: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    roles?: RoleName[];
    isActive?: boolean;
  }
}

export type AppJwt = JWT;
