import React from 'react';
import PropTypes from 'prop-types';

import { Button, TextField } from '@mui/material';
import { CloudUpload } from '@mui/icons-material';

import { I18n } from '@iobroker/adapter-react-v5';
import { ConfigGeneric } from '@iobroker/json-config';

class Dropbox extends ConfigGeneric {
    renderItem() {
        return <div style={{ width: '100%', margin: '0 0 1rem 0' }}>
            <div style={{ width: '100%', margin: '0 0 1rem 0' }}>
                <span
                    hidden={this.state.dropboxUrl}
                >
                    <span style={{ marginRight: 4 }}>{`${I18n.t('Dropbox refresh token:')}`}</span>
                    {I18n.t(
                        this.state.droboxState === 'Present' || this.props.data.dropboxAccessJson ?
                            'Present' :
                            'Not present',
                    )}
                </span>
            </div>
            <Button
                disabled={this.state.dropboxUrl || !this.props.alive || this.state.running}
                endIcon={<CloudUpload />}
                variant="contained"
                onClick={() => this.setState({ running: true }, async () => {
                    const result = await this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'authDropbox', null);
                    this.setState({ dropboxUrl: result.url, codeChallenge: result.code_challenge, running: false });
                    this.props.onChange({ ...this.props.data, dropboxCodeChallenge: result.code_challenge });
                })}
            >
                {I18n.t(
                    this.props.data.dropboxAccessJson ?
                        'Renew Dropbox Access' :
                        'Get Dropbox Access',
                )}
            </Button>
            {this.state.dropboxUrl ? <>
                <div style={{ width: '100%', margin: '1rem 0 1rem 0' }}>
                    <span style={{ marginRight: 4 }}>{`${I18n.t('Authorize this app by visiting this url:')}`}</span>
                    <br />
                    <a
                        target="_blank"
                        href={`${this.state.dropboxUrl}&code_challenge=${this.state.codeChallenge}`}
                        rel="noreferrer"
                    >
                        {`${this.state.dropboxUrl}&code_challenge=${this.state.codeChallenge}`}
                    </a>
                </div>
                <TextField
                    label={I18n.t('Enter the code from that page here')}
                    variant="standard"
                    onChange={e => this.setState({ code: e.target.value })}
                    fullWidth
                />
                <Button
                    style={{ margin: '1rem 0 1rem 0' }}
                    disabled={!this.state.dropboxUrl || !this.props.alive || this.state.running}
                    endIcon={<CloudUpload />}
                    variant="contained"
                    onClick={() => this.setState({ running: true }, async () => {
                        const result = await this.props.socket.sendTo(`${this.props.adapterName}.${this.props.instance}`, 'authDropbox', { code: this.state.code, codeChallenge: this.props.data.dropboxCodeChallenge });
                        this.props.onChange({ ...this.props.data, dropboxAccessJson: result.json });
                        this.setState({ dropboxState: result.done ? 'Present' : 'Not present', running: false, dropboxUrl: null });
                    })}
                >
                    {I18n.t('Submit')}
                </Button>
            </> : null}
        </div>;
    }
}

Dropbox.propTypes = {
    socket: PropTypes.object.isRequired,
    themeType: PropTypes.string,
    themeName: PropTypes.string,
    style: PropTypes.object,
    className: PropTypes.string,
    data: PropTypes.object.isRequired,
    attr: PropTypes.string,
    schema: PropTypes.object,
    onError: PropTypes.func,
    onChange: PropTypes.func,
};

export default Dropbox;
