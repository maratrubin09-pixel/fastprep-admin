import { Controller, Get, Post, Delete, Param, Body, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { NotesService } from '../services/notes.service';
import { PepGuard, RequirePerm } from '../../authz/pep.guard';
import { WsGateway } from '../ws.gateway';

class UpsertNoteDto {
  note_text!: string;
}

@Controller('inbox')
export class NotesController {
  constructor(
    private notesService: NotesService,
    private wsGateway: WsGateway
  ) {}

  /**
   * GET /api/inbox/conversations/:id/notes
   * Get note for current user in conversation
   */
  @Get('conversations/:id/notes')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async getNote(@Param('id') conversationId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    const note = await this.notesService.get(conversationId, userId);
    return note || { note_text: '', id: null };
  }

  /**
   * POST /api/inbox/conversations/:id/notes
   * Upsert note (create or update)
   */
  @Post('conversations/:id/notes')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async upsertNote(
    @Param('id') conversationId: string,
    @Body() body: UpsertNoteDto,
    @Req() req: any
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    if (!body.note_text || typeof body.note_text !== 'string') {
      throw new BadRequestException('note_text is required');
    }

    const note = await this.notesService.upsert(conversationId, userId, body.note_text);

    // Emit WS event
    await this.wsGateway.emitInboxEvent(conversationId, 'note.upserted', {
      note_id: note.id,
      conversation_id: conversationId,
      user_id: userId,
      note_text: note.note_text,
      updated_at: note.updated_at
    });

    return note;
  }

  /**
   * DELETE /api/inbox/conversations/:id/notes
   * Remove note
   */
  @Delete('conversations/:id/notes')
  @UseGuards(PepGuard)
  @RequirePerm('inbox.view')
  async deleteNote(@Param('id') conversationId: string, @Req() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User not authenticated');
    }

    const deleted = await this.notesService.remove(conversationId, userId);

    if (deleted) {
      // Emit WS event
      await this.wsGateway.emitInboxEvent(conversationId, 'note.deleted', {
        conversation_id: conversationId,
        user_id: userId
      });
    }

    return { success: deleted };
  }
}

