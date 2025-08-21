import { ComponentFixture, TestBed } from '@angular/core/testing';

import { NgclientLib } from './ngclient-lib';

describe('NgclientLib', () => {
  let component: NgclientLib;
  let fixture: ComponentFixture<NgclientLib>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NgclientLib]
    })
    .compileComponents();

    fixture = TestBed.createComponent(NgclientLib);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
